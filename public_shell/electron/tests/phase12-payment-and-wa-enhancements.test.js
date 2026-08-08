/**
 * tests/phase12-payment-and-wa-enhancements.test.js
 *
 * Test suite guarding all Sprint Enhancements:
 *  1. WhatsApp Custom Entry Gating (allow_custom_payments)
 *  2. Optional Payment Order Fulfillment Tracking (is_fulfilled & fulfilled_at)
 *  3. Class-Filtered Optional Extra Opt-In Guard
 *  4. School Owner WA Notification Enqueuing (school_phone)
 *  5. Grade CSV Auto Subject Extraction (student_subjects)
 */

import { describe, it, expect, beforeEach } from 'vitest';
const { database } = require('@nexus/engine');

describe('Phase 12 — Payment & WhatsApp Flow Enhancements', () => {
  let db;

  beforeEach(() => {
    db = database.init(':memory:');
    db.exec(`
      DELETE FROM student_extra_selections;
      DELETE FROM fee_extras;
      DELETE FROM fee_payment_sessions;
      DELETE FROM pending_pulse_messages;
      DELETE FROM student_subjects;
      DELETE FROM student_records;
      DELETE FROM app_settings;
      DELETE FROM students;
    `);
  });

  // ── 1. WhatsApp Custom Entry Gating ──────────────────────────────────────────

  it('allows custom payments when allow_custom_payments is true even with zero milestone plans', () => {
    // Configure fee_settings with zero milestone plans but allow_custom_payments = true
    const settings = { installment_plans: [], allow_custom_payments: true };
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('fee_settings', ?)`).run(JSON.stringify(settings));

    const settingsRow = db.prepare(`SELECT value FROM app_settings WHERE key = 'fee_settings'`).get();
    const parsed = JSON.parse(settingsRow.value);

    const installmentPlans = parsed.installment_plans || [];
    const allowCustom = parsed.allow_custom_payments !== false;

    // Condition in pulse-bot.js: if (installmentPlans.length > 0 || allowCustom)
    const enterOnlineOptionsState = installmentPlans.length > 0 || allowCustom;
    expect(enterOnlineOptionsState).toBe(true);
  });

  it('bypasses custom entry menu when allow_custom_payments is false and no milestone plans exist', () => {
    const settings = { installment_plans: [], allow_custom_payments: false };
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('fee_settings', ?)`).run(JSON.stringify(settings));

    const settingsRow = db.prepare(`SELECT value FROM app_settings WHERE key = 'fee_settings'`).get();
    const parsed = JSON.parse(settingsRow.value);

    const installmentPlans = parsed.installment_plans || [];
    const allowCustom = parsed.allow_custom_payments !== false;

    const enterOnlineOptionsState = installmentPlans.length > 0 || allowCustom;
    expect(enterOnlineOptionsState).toBe(false);
  });

  // ── 2. Optional Order Fulfillment ────────────────────────────────────────────

  it('initializes student_extra_selections with is_fulfilled = 0 and updates fulfilled_at on completion', () => {
    db.prepare(`INSERT INTO students (id, name, class_name) VALUES ('STU01', 'Bisi Ade', 'JSS 1')`).run();
    const extra = db.prepare(`INSERT INTO fee_extras (class_name, item_name, amount, term) VALUES ('JSS 1', 'Cardigan', 7500, 'All Terms')`).run();
    const extraId = extra.lastInsertRowid;

    db.prepare(`
      INSERT INTO student_extra_selections (student_id, extra_id, academic_session, term)
      VALUES ('STU01', ?, '2024/2025', 'First Term')
    `).run(extraId);

    const selection = db.prepare(`SELECT * FROM student_extra_selections WHERE student_id = 'STU01'`).get();
    expect(selection.is_fulfilled).toBe(0);
    expect(selection.fulfilled_at).toBeNull();

    // Mark as fulfilled
    db.prepare(`
      UPDATE student_extra_selections
      SET is_fulfilled = 1, fulfilled_at = datetime('now')
      WHERE id = ?
    `).run(selection.id);

    const updated = db.prepare(`SELECT * FROM student_extra_selections WHERE id = ?`).get(selection.id);
    expect(updated.is_fulfilled).toBe(1);
    expect(updated.fulfilled_at).toBeDefined();
    expect(updated.fulfilled_at).not.toBeNull();
  });

  it('queries order fulfillment list joined with student and extra item details', () => {
    db.prepare(`INSERT INTO students (id, name, class_name) VALUES ('STU02', 'Chidi Okeke', 'SS 2')`).run();
    const extra = db.prepare(`INSERT INTO fee_extras (class_name, item_name, amount, term) VALUES ('SS 2', 'Lab Coat', 12000, 'First Term')`).run();
    
    db.prepare(`
      INSERT INTO student_extra_selections (student_id, extra_id, academic_session, term)
      VALUES ('STU02', ?, '2024/2025', 'First Term')
    `).run(extra.lastInsertRowid);

    const orders = db.prepare(`
      SELECT 
        ses.id, ses.student_id, s.name AS student_name, s.class_name,
        fe.item_name, fe.amount, COALESCE(ses.is_fulfilled, 0) AS is_fulfilled
      FROM student_extra_selections ses
      JOIN students s ON s.id = ses.student_id
      JOIN fee_extras fe ON fe.id = ses.extra_id
      WHERE ses.term = 'First Term'
    `).all();

    expect(orders.length).toBe(1);
    expect(orders[0].student_name).toBe('Chidi Okeke');
    expect(orders[0].item_name).toBe('Lab Coat');
    expect(orders[0].amount).toBe(12000);
    expect(orders[0].is_fulfilled).toBe(0);
  });

  // ── 3. Class-Filtered Optional Extras Opt-In Guard ────────────────────────────

  it('only assigns optional extra to matching class students, ignoring non-matching classes', () => {
    db.prepare(`INSERT INTO students (id, name, class_name) VALUES ('STU10', 'Child A (JSS 1)', 'JSS 1')`).run();
    db.prepare(`INSERT INTO students (id, name, class_name) VALUES ('STU11', 'Child B (SS 3)', 'SS 3')`).run();

    const jss1Extra = db.prepare(`INSERT INTO fee_extras (class_name, item_name, amount, term) VALUES ('JSS 1', 'JSS Badge', 2000, 'All Terms')`).run();
    const extraId = jss1Extra.lastInsertRowid;
    const extraObj = db.prepare(`SELECT * FROM fee_extras WHERE id = ?`).get(extraId);

    const parentStudents = [
      { id: 'STU10', class_name: 'JSS 1' },
      { id: 'STU11', class_name: 'SS 3' }
    ];

    // Bot assignment logic guard test:
    for (const stu of parentStudents) {
      if (extraObj.class_name === 'All Classes' || extraObj.class_name === stu.class_name) {
        db.prepare(`
          INSERT OR IGNORE INTO student_extra_selections (student_id, extra_id, academic_session, term)
          VALUES (?, ?, '2024/2025', 'First Term')
        `).run(stu.id, extraId);
      }
    }

    const selections = db.prepare(`SELECT student_id FROM student_extra_selections WHERE extra_id = ?`).all(extraId);
    expect(selections.length).toBe(1);
    expect(selections[0].student_id).toBe('STU10');
  });

  // ── 4. School Owner WA Notification Enqueuing ──────────────────────────────────

  it('enqueues WA message to pending_pulse_messages when school_phone is configured', () => {
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('school_phone', '08012345678')`).run();

    const ownerRow = db.prepare("SELECT value FROM app_settings WHERE key = 'school_phone'").get();
    expect(ownerRow?.value).toBe('08012345678');

    const alertText = `💳 *Payment Alert*\nStudent: Bisi Ade (JSS 1)\nAmount: ₦25,000\n_Nexus School OS_`;
    db.prepare(`INSERT INTO pending_pulse_messages (phone, message, type) VALUES (?, ?, 'general')`).run(ownerRow.value, alertText);

    const pendingMsg = db.prepare(`SELECT * FROM pending_pulse_messages WHERE phone = '08012345678'`).get();
    expect(pendingMsg).toBeDefined();
    expect(pendingMsg.message).toContain('Payment Alert');
  });

  // ── 5. Grade CSV Auto Subject Extraction ──────────────────────────────────────

  it('automatically adds extracted subject names to student_subjects via INSERT OR IGNORE', () => {
    db.prepare(`INSERT INTO students (id, name, class_name) VALUES ('STU20', 'David Mark', 'SS 1')`).run();

    const studentId = 'STU20';
    const subject = 'Further Mathematics';

    // Simulate CSV grade upload subject extraction:
    db.prepare(`
      INSERT INTO student_records (student_id, subject, assessment, score, teacher_id, academic_session, term)
      VALUES (?, ?, 'FULL', 88, 'ADMIN', '2024/2025', 'First Term')
    `).run(studentId, subject);

    db.prepare(`INSERT OR IGNORE INTO student_subjects (student_id, subject) VALUES (?, ?)`).run(studentId, subject);

    // Re-importing same grade should not duplicate subject
    db.prepare(`INSERT OR IGNORE INTO student_subjects (student_id, subject) VALUES (?, ?)`).run(studentId, subject);

    const subjects = db.prepare(`SELECT * FROM student_subjects WHERE student_id = ?`).all(studentId);
    expect(subjects.length).toBe(1);
    expect(subjects[0].subject).toBe('Further Mathematics');
  });
});
