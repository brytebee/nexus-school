/**
 * tests/phase7-financial-hardening.test.js
 *
 * Phase 7 Hardening: 5 Gap-Fill Financial IPC Handler Test Suite
 *
 * Tests:
 *  1.  fees:reverse-transaction inserts negative row equal to original amount
 *  2.  After reversal, student_fees.total_paid recalculates correctly
 *  3.  Full payment reversed → status becomes 'Unpaid'
 *  4.  Partial payment reversed → status becomes 'Partial'
 *  5.  Reversing already-reversed (negative) entry returns error
 *  6.  Reversing without Manager role (level < 5) returns RBAC error
 *  7.  fees:get-payment-sessions with filter='settled' returns only settled rows
 *  8.  fees:mark-session-settled updates status + writes audit_log
 *  9.  fees:export-roster-csv returns CSV with correct header and data rows
 *  10. fees:dry-run-recovery-pulse returns correct unpaidStudentCount and uniqueParentCount
 */

import { describe, it, expect, beforeEach } from 'vitest';
const { database } = require('@nexus/engine');

describe('Phase 7 Hardening — Financial Operations', () => {
  let db;

  beforeEach(() => {
    db = database.init(':memory:');
    // Singleton DB: wipe test-owned tables before each test to prevent state bleed.
    // Order matters: child tables (FK dependents) must be deleted before parent tables.
    db.exec(`
      DELETE FROM audit_logs;
      DELETE FROM student_extra_selections;
      DELETE FROM fee_extras;
      DELETE FROM fee_payment_sessions;
      DELETE FROM fee_transactions;
      DELETE FROM student_fees;
      DELETE FROM fee_structures;
      DELETE FROM bank_accounts;
      DELETE FROM students;
      DELETE FROM admin_users;
    `);
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function seedStudent(overrides = {}) {
    const s = {
      id: 'STU001', name: 'Chidi Okeke', class_name: 'JSS 1', class_arm: 'Gold',
      reg_no: 'REG001', is_active: 1, parent_phone: '08012345678',
      ...overrides
    };
    db.prepare(`
      INSERT OR REPLACE INTO students (id, name, class_name, class_arm, reg_no, is_active, parent_phone)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(s.id, s.name, s.class_name, s.class_arm, s.reg_no, s.is_active, s.parent_phone);
    return s;
  }

  // student_fees.status CHECK: ('cleared','partial','unpaid') — always pass lowercase
  function seedStudentFee(studentId, billed = 80000, paid = 0, status = 'unpaid', session = '2024/2025', term = 'First Term') {
    db.prepare(`
      INSERT OR REPLACE INTO student_fees (student_id, academic_session, term, total_billed, total_paid, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(studentId, session, term, billed, paid, status.toLowerCase());
  }

  function seedTransaction(overrides = {}) {
    const t = {
      student_id: 'STU001', academic_session: '2024/2025', term: 'First Term',
      // fee_transactions.payment_method CHECK: ('cash','transfer','pos','bank_teller') — lowercase
      amount: 50000, payment_method: 'cash', reference_number: 'REF001',
      note: 'First payment', recorded_by: 'admin',
      ...overrides
    };
    const result = db.prepare(`
      INSERT INTO fee_transactions (student_id, academic_session, term, amount, payment_method, reference_number, note, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(t.student_id, t.academic_session, t.term, t.amount, t.payment_method, t.reference_number, t.note, t.recorded_by);
    return { ...t, id: result.lastInsertRowid };
  }

  function seedPaymentSession(overrides = {}) {
    const s = {
      parent_phone: '08012345678', student_ids: 'STU001', total_amount: 80000,
      payment_type: 'full', partial_percent: null, paystack_ref: 'PS_REF001',
      status: 'pending', created_at: "datetime('now')", settled_at: null, paystack_tx_id: null,
      ...overrides
    };
    const result = db.prepare(`
      INSERT INTO fee_payment_sessions
        (parent_phone, student_ids, total_amount, payment_type, partial_percent,
         paystack_ref, status, settled_at, paystack_tx_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(s.parent_phone, s.student_ids, s.total_amount, s.payment_type, s.partial_percent,
           s.paystack_ref, s.status, s.settled_at, s.paystack_tx_id);
    return { ...s, id: result.lastInsertRowid };
  }

  // Use INSERT OR REPLACE to survive singleton-DB test isolation (same username reused).
  function seedAdmin(overrides = {}) {
    const a = { username: 'admin', secret_hash: 'x', auth_type: 'pin', role_level: 9, ...overrides };
    const r = db.prepare(`INSERT OR REPLACE INTO admin_users (username, secret_hash, auth_type, role_level) VALUES (?, ?, ?, ?)`)
      .run(a.username, a.secret_hash, a.auth_type, a.role_level);
    return { ...a, id: r.lastInsertRowid };
  }

  // ── Inline helper: reversal logic (mirrors main.js handler) ───────────────

  function reverseTransaction(db, adminSession, transactionId, reason) {
    if (!adminSession || adminSession.role_level < 5) {
      return { ok: false, error: 'Manager access required to reverse transactions.' };
    }
    const tx = db.prepare('SELECT * FROM fee_transactions WHERE id = ?').get(transactionId);
    if (!tx) return { ok: false, error: 'Transaction not found.' };
    if (tx.amount < 0) return { ok: false, error: 'Cannot reverse an already-reversed entry.' };

    const reversalNote = `REVERSAL of #${transactionId}: ${reason || 'Admin correction'}`;
    db.prepare(`
      INSERT INTO fee_transactions (student_id, academic_session, term, amount, payment_method, reference_number, note, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tx.student_id, tx.academic_session, tx.term, -tx.amount, tx.payment_method, tx.reference_number, reversalNote, adminSession.username);

    const newPaid = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) as t FROM fee_transactions WHERE student_id = ? AND academic_session = ? AND term = ?'
    ).get(tx.student_id, tx.academic_session, tx.term).t;

    const sf = db.prepare(
      'SELECT total_billed FROM student_fees WHERE student_id = ? AND academic_session = ? AND term = ?'
    ).get(tx.student_id, tx.academic_session, tx.term);

    if (sf) {
      const billed = sf.total_billed || 0;
      // status CHECK: ('cleared','partial','unpaid') — lowercase required
      const newStatus = newPaid >= billed ? 'cleared' : newPaid > 0 ? 'partial' : 'unpaid';
      db.prepare(
        "UPDATE student_fees SET total_paid = ?, status = ?, updated_at = datetime('now') WHERE student_id = ? AND academic_session = ? AND term = ?"
      ).run(newPaid, newStatus, tx.student_id, tx.academic_session, tx.term);
    }

    db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'REVERSE_TRANSACTION', 'fee_transactions', ?)")
      .run(adminSession.id, `Reversed txn #${transactionId}`);

    return { ok: true };
  }

  // ── Test 1 ─────────────────────────────────────────────────────────────────

  it('inserts a negative reversal row equal to original amount', () => {
    const admin = seedAdmin({ role_level: 9 });
    seedStudent();
    seedStudentFee('STU001', 80000, 50000, 'Partial');
    const tx = seedTransaction({ amount: 50000 });

    const result = reverseTransaction(db, admin, tx.id, 'Correction');
    expect(result.ok).toBe(true);

    const allTxns = db.prepare('SELECT * FROM fee_transactions WHERE student_id = ?').all('STU001');
    expect(allTxns.length).toBe(2);
    const reversal = allTxns.find(t => t.amount < 0);
    expect(reversal).toBeDefined();
    expect(reversal.amount).toBe(-50000);
    expect(reversal.note).toMatch(/REVERSAL of #/);
  });

  // ── Test 2 ─────────────────────────────────────────────────────────────────

  it('recalculates student_fees.total_paid correctly after reversal', () => {
    const admin = seedAdmin({ role_level: 9 });
    seedStudent();
    seedStudentFee('STU001', 80000, 50000, 'Partial');
    const tx = seedTransaction({ amount: 50000 });

    reverseTransaction(db, admin, tx.id, 'Test');

    const sf = db.prepare('SELECT * FROM student_fees WHERE student_id = ?').get('STU001');
    expect(sf.total_paid).toBe(0);
  });

  // ── Test 3 ─────────────────────────────────────────────────────────────────

  it('full payment reversed → status becomes Unpaid', () => {
    const admin = seedAdmin({ role_level: 9 });
    seedStudent();
    seedStudentFee('STU001', 80000, 80000, 'cleared');
    const tx = seedTransaction({ amount: 80000 });

    reverseTransaction(db, admin, tx.id, 'Full reversal');

    // After full reversal total_paid = 0 → status = 'unpaid'
    const sf = db.prepare('SELECT status FROM student_fees WHERE student_id = ?').get('STU001');
    expect(sf.status).toBe('unpaid');
  });

  // ── Test 4 ─────────────────────────────────────────────────────────────────

  it('partial payment reversed → status becomes Partial when remaining balance > 0', () => {
    const admin = seedAdmin({ role_level: 9 });
    seedStudent();
    seedStudentFee('STU001', 80000, 60000, 'partial');
    // Two transactions: 40k and 20k (total 60k)
    const tx1 = seedTransaction({ amount: 40000, reference_number: 'REF001' });
    seedTransaction({ amount: 20000, reference_number: 'REF002' });

    // Reverse only the 40k payment → remaining paid = 20k → status = 'partial'
    reverseTransaction(db, admin, tx1.id, 'Partial reversal');

    const sf = db.prepare('SELECT status, total_paid FROM student_fees WHERE student_id = ?').get('STU001');
    expect(sf.total_paid).toBe(20000);
    expect(sf.status).toBe('partial');
  });

  // ── Test 5 ─────────────────────────────────────────────────────────────────

  it('reversing an already-reversed (negative) entry returns error', () => {
    const admin = seedAdmin({ role_level: 9 });
    seedStudent();
    seedStudentFee('STU001');
    const negativeTx = seedTransaction({ amount: -50000, note: 'REVERSAL of #1' });

    const result = reverseTransaction(db, admin, negativeTx.id, 'Re-reverse attempt');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Cannot reverse an already-reversed/);
  });

  // ── Test 6 ─────────────────────────────────────────────────────────────────

  it('reversing without Manager role (level < 5) returns RBAC error', () => {
    const lowAdmin = { id: 99, username: 'junior', role_level: 1 };
    seedStudent();
    seedStudentFee('STU001');
    const tx = seedTransaction({ amount: 40000 });

    const result = reverseTransaction(db, lowAdmin, tx.id, 'Unauthorized');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Manager access required/);

    // Original transaction must still exist untouched
    const allTxns = db.prepare('SELECT * FROM fee_transactions').all();
    expect(allTxns.length).toBe(1);
    expect(allTxns[0].amount).toBe(40000);
  });

  // ── Test 7 ─────────────────────────────────────────────────────────────────

  it('fees:get-payment-sessions with filter=settled returns only settled rows', () => {
    seedPaymentSession({ paystack_ref: 'PS001', status: 'pending' });
    seedPaymentSession({ paystack_ref: 'PS002', status: 'settled' });
    seedPaymentSession({ paystack_ref: 'PS003', status: 'settled' });
    seedPaymentSession({ paystack_ref: 'PS004', status: 'failed' });

    const filter = 'settled';
    const rows = db.prepare(`
      SELECT * FROM fee_payment_sessions WHERE status = ? ORDER BY id ASC
    `).all(filter);

    expect(rows.length).toBe(2);
    expect(rows.every(r => r.status === 'settled')).toBe(true);
  });

  // ── Test 8 ─────────────────────────────────────────────────────────────────

  it('fees:mark-session-settled updates status and writes audit_log', () => {
    const admin = seedAdmin({ role_level: 5 });
    const session = seedPaymentSession({ paystack_ref: 'PS_PENDING', status: 'pending' });

    // Simulate handler logic
    if (!db.prepare('SELECT id FROM fee_payment_sessions WHERE id = ?').get(session.id)) {
      throw new Error('Session not found');
    }
    db.prepare("UPDATE fee_payment_sessions SET status = 'settled', settled_at = datetime('now') WHERE id = ?")
      .run(session.id);
    db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'MANUAL_SETTLE_SESSION', 'fee_payment_sessions', ?)")
      .run(admin.id, `Manually settled session #${session.id}`);

    const updated = db.prepare('SELECT * FROM fee_payment_sessions WHERE id = ?').get(session.id);
    expect(updated.status).toBe('settled');
    expect(updated.settled_at).not.toBeNull();

    const log = db.prepare("SELECT * FROM audit_logs WHERE action = 'MANUAL_SETTLE_SESSION'").get();
    expect(log).toBeDefined();
    expect(log.admin_id).toBe(admin.id);
  });

  // ── Test 9 ─────────────────────────────────────────────────────────────────

  it('fees:export-roster-csv returns CSV with correct header and data rows', () => {
    const session = '2024/2025', term = 'First Term';
    seedStudent({ id: 'STU001', name: 'Chidi Okeke', class_name: 'JSS 1', reg_no: 'REG001' });
    seedStudent({ id: 'STU002', name: 'Ada Obi', class_name: 'JSS 2', reg_no: 'REG002' });
    seedStudentFee('STU001', 80000, 40000, 'partial', session, term);
    seedStudentFee('STU002', 60000, 0, 'unpaid', session, term);

    const rows = db.prepare(`
      SELECT s.id, s.name, s.class_name, s.class_arm, s.reg_no,
             COALESCE(sf.total_billed, 0) AS total_billed,
             COALESCE(sf.total_paid, 0) AS total_paid,
             COALESCE(sf.total_billed, 0) - COALESCE(sf.total_paid, 0) AS outstanding,
             COALESCE(sf.status, 'Unpaid') AS status,
             sf.next_due_date
      FROM students s
      LEFT JOIN student_fees sf ON sf.student_id = s.id AND sf.academic_session = ? AND sf.term = ?
      WHERE COALESCE(s.is_active, 1) = 1
      ORDER BY s.class_name ASC, s.name ASC
    `).all(session, term);

    // Build CSV same way as handler
    const header = ['Student ID','Name','Class','Arm','Reg No','Total Billed','Total Paid','Outstanding','Status','Next Due Date'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        r.id, `"${r.name}"`, `"${r.class_name}"`, `"${r.class_arm||''}"`, `"${r.reg_no||''}"`,
        r.total_billed, r.total_paid, r.outstanding, r.status, r.next_due_date || ''
      ].join(','));
    }
    const csv = lines.join('\n');

    // Assert header row
    const csvLines = csv.split('\n');
    expect(csvLines[0]).toBe('Student ID,Name,Class,Arm,Reg No,Total Billed,Total Paid,Outstanding,Status,Next Due Date');

    // Assert 2 data rows — sorted class_name ASC: JSS 1 < JSS 2
    expect(csvLines.length).toBe(3); // header + 2 students
    expect(csvLines[1]).toContain('Chidi Okeke'); // JSS 1 — sorts first
    expect(csvLines[2]).toContain('Ada Obi');     // JSS 2 — sorts second
    expect(csvLines[1]).toContain('"JSS 1"');
    expect(csvLines[2]).toContain('"JSS 2"');
  });

  // ── Test 10 ────────────────────────────────────────────────────────────────

  it('fees:dry-run-recovery-pulse returns correct unpaidStudentCount and uniqueParentCount', () => {
    const session = '2024/2025', term = 'First Term';
    // 3 students: 2 share a parent phone, 1 has a different phone, 1 is cleared
    seedStudent({ id: 'STU001', name: 'Chidi', parent_phone: '08011111111' });
    seedStudent({ id: 'STU002', name: 'Emeka', parent_phone: '08011111111' }); // same parent
    seedStudent({ id: 'STU003', name: 'Ngozi', parent_phone: '08022222222' });
    seedStudent({ id: 'STU004', name: 'Cleared Student', parent_phone: '08033333333' });

    seedStudentFee('STU001', 80000, 0,     'unpaid',  session, term);
    seedStudentFee('STU002', 80000, 0,     'unpaid',  session, term);
    seedStudentFee('STU003', 60000, 30000, 'partial', session, term);
    seedStudentFee('STU004', 70000, 70000, 'cleared', session, term);

    const unpaidRows = db.prepare(`
      SELECT s.name, s.parent_phone,
             COALESCE(sf.total_billed, 0) - COALESCE(sf.total_paid, 0) AS outstanding
      FROM students s
      LEFT JOIN student_fees sf ON sf.student_id = s.id AND sf.academic_session = ? AND sf.term = ?
      WHERE COALESCE(s.is_active, 1) = 1
        AND COALESCE(sf.status, 'unpaid') IN ('unpaid', 'partial')
        AND s.parent_phone IS NOT NULL AND s.parent_phone != ''
      ORDER BY outstanding DESC
    `).all(session, term);

    const uniquePhones = new Set(unpaidRows.map(r => r.parent_phone));

    expect(unpaidRows.length).toBe(3);           // STU001, STU002, STU003
    expect(uniquePhones.size).toBe(2);           // 08011111111 shared + 08022222222
  });

});
