/**
 * tests/phase8-optional-fees.test.js
 *
 * Phase 8: Optional Fees & Multi-Bank Routing Test Suite
 *
 * Tests:
 *  1. fee_extras upsert creates row with correct bank_account_id
 *  2. fee-extras:toggle-selection (opt-in) inserts into student_extra_selections
 *  3. De-selecting removes the selection record (opt-out)
 *  4. bank_account_id on fee_structures item persists correctly after upsert
 *  5. Receipt itemization groups correctly by bank_account_id
 *  6. Extras with bank_account_id = null go to cash-only bucket
 */

import { describe, it, expect, beforeEach } from 'vitest';
const { database } = require('@nexus/engine');

describe('Phase 8 — Optional Fees & Multi-Bank Routing', () => {
  let db;

  beforeEach(() => {
    db = database.init(':memory:');
    // Singleton DB: wipe test-owned tables before each test to prevent state bleed.
    db.exec(`
      DELETE FROM student_extra_selections;
      DELETE FROM fee_extras;
      DELETE FROM fee_structures;
      DELETE FROM student_fees;
      DELETE FROM fee_transactions;
      DELETE FROM bank_accounts;
      DELETE FROM students;
    `);
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function seedBankAccount(overrides = {}) {
    const b = {
      bank_name: 'First Bank', bank_code: '011', account_number: '1234567890',
      account_name: 'School Account', paystack_verified: 1, subaccount_code: 'ACCT_sub001',
      is_active: 1, ...overrides
    };
    const r = db.prepare(`
      INSERT INTO bank_accounts (bank_name, bank_code, account_number, account_name, paystack_verified, subaccount_code, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(b.bank_name, b.bank_code, b.account_number, b.account_name, b.paystack_verified, b.subaccount_code, b.is_active);
    return { ...b, id: r.lastInsertRowid };
  }

  function seedStudent(overrides = {}) {
    const s = { id: 'STU001', name: 'Amaka Eze', class_name: 'JSS 1', class_arm: 'Gold', reg_no: 'REG001', is_active: 1, ...overrides };
    db.prepare(`INSERT OR REPLACE INTO students (id, name, class_name, class_arm, reg_no, is_active) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(s.id, s.name, s.class_name, s.class_arm, s.reg_no, s.is_active);
    return s;
  }

  // ── Test 1 ─────────────────────────────────────────────────────────────────

  it('fee_extras upsert creates row with correct bank_account_id', () => {
    const bank = seedBankAccount({ bank_name: 'Supplies Bank', subaccount_code: 'ACCT_supply' });

    const result = db.prepare(`
      INSERT INTO fee_extras (class_name, item_name, amount, term, bank_account_id)
      VALUES (?, ?, ?, ?, ?)
    `).run('JSS 1', 'School Uniform', 8000, 'First Term', bank.id);

    expect(result.lastInsertRowid).toBeDefined();

    const row = db.prepare('SELECT * FROM fee_extras WHERE id = ?').get(result.lastInsertRowid);
    expect(row.item_name).toBe('School Uniform');
    expect(row.amount).toBe(8000);
    expect(row.bank_account_id).toBe(bank.id);
    expect(row.is_active).toBe(1);
  });

  // ── Test 2 ─────────────────────────────────────────────────────────────────

  it('toggle-selection (opt-in) inserts row into student_extra_selections', () => {
    const bank = seedBankAccount();
    seedStudent();
    const extra = db.prepare(`INSERT INTO fee_extras (class_name, item_name, amount, term, bank_account_id) VALUES ('JSS 1', 'Sports Kit', 5000, 'All Terms', ?)`)
      .run(bank.id);
    const extraId = extra.lastInsertRowid;

    // Simulate opt-in
    db.prepare(`
      INSERT OR IGNORE INTO student_extra_selections (student_id, extra_id, academic_session, term)
      VALUES (?, ?, ?, ?)
    `).run('STU001', extraId, '2024/2025', 'First Term');

    const sel = db.prepare(`SELECT * FROM student_extra_selections WHERE student_id = ? AND extra_id = ?`).get('STU001', extraId);
    expect(sel).toBeDefined();
    expect(sel.student_id).toBe('STU001');
    expect(sel.extra_id).toBe(extraId);
  });

  // ── Test 3 ─────────────────────────────────────────────────────────────────

  it('toggle-selection (opt-out) removes the selection record', () => {
    const bank = seedBankAccount();
    seedStudent();
    const extra = db.prepare(`INSERT INTO fee_extras (class_name, item_name, amount, term, bank_account_id) VALUES ('JSS 1', 'Trip Fee', 15000, 'All Terms', ?)`)
      .run(bank.id);
    const extraId = extra.lastInsertRowid;

    // Opt in
    db.prepare(`INSERT OR IGNORE INTO student_extra_selections (student_id, extra_id, academic_session, term) VALUES (?, ?, ?, ?)`)
      .run('STU001', extraId, '2024/2025', 'First Term');
    expect(db.prepare(`SELECT id FROM student_extra_selections WHERE student_id = ?`).get('STU001')).toBeDefined();

    // Opt out — delete the specific selection for THIS extra only
    db.prepare(`DELETE FROM student_extra_selections WHERE student_id = ? AND extra_id = ? AND academic_session = ? AND term = ?`)
      .run('STU001', extraId, '2024/2025', 'First Term');

    // Confirm this specific selection is gone (filter by extra_id, not just student_id)
    expect(db.prepare(`SELECT id FROM student_extra_selections WHERE student_id = ? AND extra_id = ?`).get('STU001', extraId)).toBeUndefined();
  });

  // ── Test 4 ─────────────────────────────────────────────────────────────────

  it('bank_account_id on fee_structures item persists correctly after upsert', () => {
    const bank = seedBankAccount({ bank_name: 'Main Tuition Bank' });

    // Simulate updated upsert with bank_account_id
    const result = db.prepare(`
      INSERT OR REPLACE INTO fee_structures (class_name, item_name, amount, term, bank_account_id, is_optional)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('JSS 1', 'Tuition', 80000, 'First Term', bank.id, 0);

    const row = db.prepare('SELECT * FROM fee_structures WHERE id = ?').get(result.lastInsertRowid);
    expect(row.bank_account_id).toBe(bank.id);
    expect(row.is_optional).toBe(0);

    // Update — should preserve bank_account_id
    db.prepare('UPDATE fee_structures SET amount = ?, bank_account_id = ? WHERE id = ?')
      .run(85000, bank.id, result.lastInsertRowid);
    const updated = db.prepare('SELECT * FROM fee_structures WHERE id = ?').get(result.lastInsertRowid);
    expect(updated.amount).toBe(85000);
    expect(updated.bank_account_id).toBe(bank.id);
  });

  // ── Test 5 ─────────────────────────────────────────────────────────────────

  it('receipt itemization groups fee items correctly by bank_account_id', () => {
    const bankA = seedBankAccount({ bank_name: 'Main School Bank', subaccount_code: 'ACCT_main' });
    const bankB = seedBankAccount({ bank_name: 'Supplies Bank', subaccount_code: 'ACCT_supply', account_number: '9876543210' });

    // fee_structures: tuition and dev levy → Bank A
    db.prepare(`INSERT INTO fee_structures (class_name, item_name, amount, term, bank_account_id) VALUES ('JSS 1', 'Tuition', 80000, 'First Term', ?)`)
      .run(bankA.id);
    db.prepare(`INSERT INTO fee_structures (class_name, item_name, amount, term, bank_account_id) VALUES ('JSS 1', 'Dev Levy', 5000, 'First Term', ?)`)
      .run(bankA.id);

    // fee_extras: uniform → Bank B
    const uniformExtra = db.prepare(`INSERT INTO fee_extras (class_name, item_name, amount, term, bank_account_id) VALUES ('JSS 1', 'Uniform', 8000, 'First Term', ?)`)
      .run(bankB.id);

    // Fetch all items for JSS 1 with their bank
    const feeItems = db.prepare(`SELECT fs.item_name, fs.amount, fs.bank_account_id, ba.subaccount_code
      FROM fee_structures fs LEFT JOIN bank_accounts ba ON ba.id = fs.bank_account_id
      WHERE fs.class_name = ? AND fs.term = ?`).all('JSS 1', 'First Term');
    const extraItems = db.prepare(`SELECT fe.item_name, fe.amount, fe.bank_account_id, ba.subaccount_code
      FROM fee_extras fe LEFT JOIN bank_accounts ba ON ba.id = fe.bank_account_id
      WHERE fe.class_name = ? AND fe.term = ? AND fe.is_active = 1`).all('JSS 1', 'First Term');

    const allItems = [...feeItems, ...extraItems];

    // Group by bank_account_id
    const groups = {};
    for (const item of allItems) {
      const key = item.bank_account_id ?? 'cash';
      if (!groups[key]) groups[key] = { subaccount_code: item.subaccount_code, total: 0, items: [] };
      groups[key].total += item.amount;
      groups[key].items.push(item.item_name);
    }

    expect(Object.keys(groups).length).toBe(2);
    expect(groups[bankA.id].total).toBe(85000); // 80k + 5k
    expect(groups[bankA.id].subaccount_code).toBe('ACCT_main');
    expect(groups[bankB.id].total).toBe(8000);
    expect(groups[bankB.id].subaccount_code).toBe('ACCT_supply');
  });

  // ── Test 6 ─────────────────────────────────────────────────────────────────

  it('extras with bank_account_id = null go to cash-only bucket', () => {
    const bank = seedBankAccount();

    // One extra with bank, one without
    db.prepare(`INSERT INTO fee_extras (class_name, item_name, amount, term, bank_account_id) VALUES ('JSS 1', 'Sports Kit', 5000, 'First Term', ?)`)
      .run(bank.id);
    db.prepare(`INSERT INTO fee_extras (class_name, item_name, amount, term, bank_account_id) VALUES ('JSS 1', 'Optional Trip', 12000, 'First Term', NULL)`)
      .run();

    const extras = db.prepare(`SELECT * FROM fee_extras WHERE class_name = ? AND term = ?`).all('JSS 1', 'First Term');

    const paystack = extras.filter(e => e.bank_account_id !== null);
    const cashOnly = extras.filter(e => e.bank_account_id === null);

    expect(paystack.length).toBe(1);
    expect(paystack[0].item_name).toBe('Sports Kit');
    expect(cashOnly.length).toBe(1);
    expect(cashOnly[0].item_name).toBe('Optional Trip');
  });

});
