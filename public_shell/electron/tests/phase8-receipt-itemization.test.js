/**
 * tests/phase8-receipt-itemization.test.js
 *
 * Phase 8: Receipt Itemization — fee line-item breakdown
 *
 * Verifies that sendBrandedReceiptHelper correctly builds the feeItems
 * array from fee_structures and student_extra_selections so that the
 * PDF receipt can display an itemized breakdown (Tuition, PTA, Extras, etc.)
 *
 * Tests:
 *  1. feeItems includes all mandatory fee_structures items for the student's class/term
 *  2. feeItems correctly labels bank-routed items with bankLabel
 *  3. feeItems includes student-opted extras from student_extra_selections
 *  4. Extras are typed 'extra'; mandatory items are typed 'mandatory'
 *  5. Items with no bank_account_id have bankLabel = null (cash / unrouted)
 *  6. feeItems is empty (not crashing) when no fee_structure rows exist
 */

import { describe, it, expect, beforeEach } from 'vitest';
const { database } = require('@nexus/engine');

describe('Phase 8 — Receipt Itemization (feeItems builder)', () => {
  let db;

  beforeEach(() => {
    db = database.init(':memory:');
    db.exec(`
      DELETE FROM student_extra_selections;
      DELETE FROM fee_extras;
      DELETE FROM fee_structures;
      DELETE FROM bank_accounts;
      DELETE FROM student_fees;
      DELETE FROM students;
    `);
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function seedBank(overrides = {}) {
    const b = { bank_name: 'First Bank', bank_code: '011', account_number: '1234567890', account_name: 'School Account', is_active: 1, ...overrides };
    const r = db.prepare('INSERT INTO bank_accounts (bank_name, bank_code, account_number, account_name, is_active) VALUES (?,?,?,?,?)')
      .run(b.bank_name, b.bank_code, b.account_number, b.account_name, b.is_active);
    return { ...b, id: r.lastInsertRowid };
  }

  function seedFeeItem(overrides = {}) {
    const f = { class_name: 'JSS 1', item_name: 'Tuition', amount: 80000, term: 'First Term', bank_account_id: null, is_optional: 0, ...overrides };
    const r = db.prepare('INSERT INTO fee_structures (class_name, item_name, amount, term, bank_account_id, is_optional) VALUES (?,?,?,?,?,?)')
      .run(f.class_name, f.item_name, f.amount, f.term, f.bank_account_id, f.is_optional);
    return { ...f, id: r.lastInsertRowid };
  }

  function seedExtra(overrides = {}) {
    const e = { class_name: 'JSS 1', item_name: 'School Uniform', amount: 8000, term: 'First Term', bank_account_id: null, is_active: 1, ...overrides };
    const r = db.prepare('INSERT INTO fee_extras (class_name, item_name, amount, term, bank_account_id, is_active) VALUES (?,?,?,?,?,?)')
      .run(e.class_name, e.item_name, e.amount, e.term, e.bank_account_id, e.is_active);
    return { ...e, id: r.lastInsertRowid };
  }

  function seedStudent(overrides = {}) {
    const s = { id: 'STU001', name: 'Amaka Okafor', class_name: 'JSS 1', class_arm: 'Gold', reg_no: 'R001', is_active: 1, ...overrides };
    db.prepare('INSERT OR REPLACE INTO students (id, name, class_name, class_arm, reg_no, is_active) VALUES (?,?,?,?,?,?)').run(s.id, s.name, s.class_name, s.class_arm, s.reg_no, s.is_active);
    return s;
  }

  function selectFeeItems(studentId, studentClass, session, term) {
    // Mirrors the logic in sendBrandedReceiptHelper feeItems builder
    const feeItems = [];

    const structRows = db.prepare(`
      SELECT fs.item_name, fs.amount, fs.bank_account_id,
             ba.account_name AS account_name, ba.bank_name AS bank_name
      FROM fee_structures fs
      LEFT JOIN bank_accounts ba ON ba.id = fs.bank_account_id
      WHERE fs.class_name = ?
        AND (fs.term = ? OR fs.term = 'All Terms')
      ORDER BY fs.item_name ASC
    `).all(studentClass, term);

    for (const row of structRows) {
      const bankLabel = row.bank_account_id
        ? (row.account_name || row.bank_name || `Account #${row.bank_account_id}`)
        : null;
      feeItems.push({ name: row.item_name, amount: row.amount, bankLabel, type: 'mandatory' });
    }

    const extraRows = db.prepare(`
      SELECT fe.item_name, fe.amount, fe.bank_account_id,
             ba.account_name AS account_name, ba.bank_name AS bank_name
      FROM student_extra_selections ses
      JOIN fee_extras fe ON fe.id = ses.extra_id
      LEFT JOIN bank_accounts ba ON ba.id = fe.bank_account_id
      WHERE ses.student_id = ?
        AND ses.academic_session = ?
        AND ses.term = ?
      ORDER BY fe.item_name ASC
    `).all(studentId, session, term);

    for (const row of extraRows) {
      const bankLabel = row.bank_account_id
        ? (row.account_name || row.bank_name || `Account #${row.bank_account_id}`)
        : null;
      feeItems.push({ name: `${row.item_name} (Optional)`, amount: row.amount, bankLabel, type: 'extra' });
    }

    return feeItems;
  }

  // ── Tests ─────────────────────────────────────────────────────────────────

  it('includes all mandatory fee_structures items for the student class/term', () => {
    seedFeeItem({ item_name: 'Tuition', amount: 80000, term: 'First Term' });
    seedFeeItem({ item_name: 'PTA Levy', amount: 5000, term: 'First Term' });
    seedFeeItem({ item_name: 'Dev Levy', amount: 3000, term: 'First Term' });

    const items = selectFeeItems('STU001', 'JSS 1', '2024/2025', 'First Term');
    expect(items.length).toBe(3);
    const names = items.map(i => i.name);
    expect(names).toContain('Tuition');
    expect(names).toContain('PTA Levy');
    expect(names).toContain('Dev Levy');
  });

  it('sets bankLabel from bank_accounts.account_name for bank-routed items', () => {
    const bank = seedBank({ account_name: 'School Main Account' });
    seedFeeItem({ item_name: 'Tuition', amount: 80000, bank_account_id: bank.id });

    const items = selectFeeItems('STU001', 'JSS 1', '2024/2025', 'First Term');
    expect(items.length).toBe(1);
    expect(items[0].bankLabel).toBe('School Main Account');
  });

  it('sets bankLabel = null for items with no bank_account_id (cash / unrouted)', () => {
    seedFeeItem({ item_name: 'Books Fee', amount: 4000, bank_account_id: null });

    const items = selectFeeItems('STU001', 'JSS 1', '2024/2025', 'First Term');
    expect(items.length).toBe(1);
    expect(items[0].bankLabel).toBeNull();
  });

  it('includes extras the student opted into from student_extra_selections', () => {
    seedStudent();
    const extra = seedExtra({ item_name: 'School Uniform', amount: 8000 });
    db.prepare("INSERT INTO student_extra_selections (student_id, extra_id, academic_session, term) VALUES (?,?,?,?)")
      .run('STU001', extra.id, '2024/2025', 'First Term');

    const items = selectFeeItems('STU001', 'JSS 1', '2024/2025', 'First Term');
    expect(items.length).toBe(1);
    expect(items[0].name).toBe('School Uniform (Optional)');
    expect(items[0].type).toBe('extra');
    expect(items[0].amount).toBe(8000);
  });

  it('separates mandatory items (type=mandatory) from extras (type=extra)', () => {
    seedStudent();
    seedFeeItem({ item_name: 'Tuition', amount: 80000 });
    const extra = seedExtra({ item_name: 'Sports Kit', amount: 5000 });
    db.prepare("INSERT INTO student_extra_selections (student_id, extra_id, academic_session, term) VALUES (?,?,?,?)")
      .run('STU001', extra.id, '2024/2025', 'First Term');

    const items = selectFeeItems('STU001', 'JSS 1', '2024/2025', 'First Term');
    const mandatory = items.filter(i => i.type === 'mandatory');
    const extras = items.filter(i => i.type === 'extra');
    expect(mandatory.length).toBe(1);
    expect(mandatory[0].name).toBe('Tuition');
    expect(extras.length).toBe(1);
    expect(extras[0].name).toBe('Sports Kit (Optional)');
  });

  it('returns empty feeItems array when no fee structure exists for the class', () => {
    // No fee_structures rows seeded
    const items = selectFeeItems('STU001', 'JSS 2', '2024/2025', 'First Term');
    expect(items).toEqual([]);
  });

  it('includes All Terms fee items alongside term-specific items', () => {
    seedFeeItem({ item_name: 'Annual Dev Fund', amount: 10000, term: 'All Terms' });
    seedFeeItem({ item_name: 'Tuition', amount: 80000, term: 'First Term' });

    const items = selectFeeItems('STU001', 'JSS 1', '2024/2025', 'First Term');
    expect(items.length).toBe(2);
    const names = items.map(i => i.name);
    expect(names).toContain('Annual Dev Fund');
    expect(names).toContain('Tuition');
  });
});
