/**
 * tests/fee-structure-priority-fallback.test.js
 *
 * Regression suite for the arm-class priority-fallback fix.
 *
 * Root cause this guards against:
 *   Queries joining fee_structures via OR (class_name = armed OR class_name = bare)
 *   SUMMED or duplicated items when fee_structures had rows for BOTH the bare class
 *   ("Learning to Read", "Reading Readiness 2") AND arm-specific classes
 *   ("Learning to Read ACE", "Reading Readiness 2 A", "Reading Readiness 2 B").
 *
 * Verified against real in-memory SQLite (database.init(':memory:')) so persisted
 * student_fees.total_billed/status, SQL normalization, and WhatsApp breakdowns
 * match production behavior.
 */
import { describe, it, expect, beforeEach } from 'vitest';
const { database } = require('@nexus/engine');
const {
  buildClassCandidates,
  resolveBaseFeeTotal,
  resolveBaseFeeStructureItems,
  recalculateStudentTotalBilled,
} = require('../src/lib/fee-calculator.js');
const { sendFeeStatus } = require('../pulse-bot.js');

const SES = '2026/2027';
const TERM = 'First Term';

function seedDuplicateSchedules(db) {
  const ins = db.prepare(`
    INSERT INTO fee_structures (class_name, item_name, amount, term)
    VALUES (?, ?, ?, ?)
  `);

  // Learning to Read (bare + ACE arm) = ₦49,000 each
  for (const cls of ['Learning to Read', 'Learning to Read ACE']) {
    ins.run(cls, 'Tuition', 45000, 'All Terms');
    ins.run(cls, 'PTF Levy', 1000, 'All Terms');
    ins.run(cls, 'Medical Fee', 1000, 'All Terms');
    ins.run(cls, 'Flags', 2000, 'All Terms');
  }

  // Reading Readiness 2 (bare + A + B) = ₦41,000 each
  for (const cls of ['Reading Readiness 2', 'Reading Readiness 2 A', 'Reading Readiness 2 B']) {
    ins.run(cls, 'Tuition', 30000, 'All Terms');
    ins.run(cls, 'PTF Levy', 1000, 'All Terms');
    ins.run(cls, 'Medical Fee', 1000, 'All Terms');
    ins.run(cls, 'Working Materials', 3000, 'All Terms');
    ins.run(cls, 'Text books', 6000, 'All Terms');
  }

  // JSS 2 (bare only = ₦58,000) & Grade 3 (bare only = ₦50,000)
  ins.run('JSS 2', 'Tuition', 55000, 'All Terms');
  ins.run('JSS 2', 'PTF', 1000, 'All Terms');
  ins.run('JSS 2', 'Medical', 1000, 'All Terms');
  ins.run('JSS 2', 'Activity', 1000, 'All Terms');

  ins.run('Grade 3', 'Tuition', 50000, 'All Terms');
}

describe('fee_structures priority fallback (SQLite integration)', () => {
  let db;

  beforeEach(() => {
    db = database.init(':memory:');
    db.exec(`
      DELETE FROM student_extra_selections;
      DELETE FROM fee_extras;
      DELETE FROM fee_adjustments;
      DELETE FROM fee_transactions;
      DELETE FROM student_fees;
      DELETE FROM fee_structures;
      DELETE FROM bank_accounts;
      DELETE FROM students;
      DELETE FROM app_settings;
    `);
    seedDuplicateSchedules(db);
  });

  // ─────────────────────────────────────────────────────────────────
  // 1. buildClassCandidates
  // ─────────────────────────────────────────────────────────────────
  describe('buildClassCandidates', () => {
    it('returns only bare class when no arm is provided or blank', () => {
      expect(buildClassCandidates('JSS 1', '')).toEqual(['JSS 1']);
      expect(buildClassCandidates('JSS 1', null)).toEqual(['JSS 1']);
      expect(buildClassCandidates('JSS 1', '   ')).toEqual(['JSS 1']);
    });

    it('returns arm-spaced, arm-hyphenated, then bare when arm is provided', () => {
      expect(buildClassCandidates('Learning to Read', 'ACE')).toEqual([
        'Learning to Read ACE',
        'Learning to Read-ACE',
        'Learning to Read',
      ]);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. resolveBaseFeeTotal — anti-double-count regression
  // ─────────────────────────────────────────────────────────────────
  describe('resolveBaseFeeTotal', () => {
    it('returns ONLY arm total (₦49k) when both bare "Learning to Read" and "Learning to Read ACE" exist', () => {
      expect(resolveBaseFeeTotal(db, 'Learning to Read', 'ACE', TERM)).toBe(49000);
    });

    it('returns ONLY arm total (₦41k) when bare "Reading Readiness 2" and armed A/B exist', () => {
      expect(resolveBaseFeeTotal(db, 'Reading Readiness 2', 'A', TERM)).toBe(41000);
      expect(resolveBaseFeeTotal(db, 'Reading Readiness 2', 'B', TERM)).toBe(41000);
    });

    it('falls back to bare class total when no arm-specific rows exist', () => {
      expect(resolveBaseFeeTotal(db, 'Grade 3', 'Gold', TERM)).toBe(50000);
    });

    it('returns bare class total cleanly for un-armed students when bare + arm schedules coexist', () => {
      expect(resolveBaseFeeTotal(db, 'Reading Readiness 2', '', TERM)).toBe(41000);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 3. resolveBaseFeeStructureItems — receipt itemization
  // ─────────────────────────────────────────────────────────────────
  describe('resolveBaseFeeStructureItems', () => {
    it('returns ONLY arm-specific items (4 items, ₦49k total) when bare + arm coexist', () => {
      const items = resolveBaseFeeStructureItems(db, 'Learning to Read', 'ACE', TERM);
      expect(items).toHaveLength(4);
      expect(items.reduce((sum, r) => sum + r.amount, 0)).toBe(49000);
    });

    it('falls back to bare items when no arm-specific rows exist', () => {
      const items = resolveBaseFeeStructureItems(db, 'Grade 3', 'Blue', TERM);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ item_name: 'Tuition', amount: 50000 });
    });

    it('returns empty array when no candidate class matches', () => {
      expect(resolveBaseFeeStructureItems(db, 'Unknown Class', 'Z', TERM)).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 4. recalculateStudentTotalBilled — persisted SQLite assertions
  // ─────────────────────────────────────────────────────────────────
  describe('recalculateStudentTotalBilled (persisted student_fees)', () => {
    const insStu = (id, name, className, arm) =>
      db.prepare(`INSERT INTO students (id, name, class_name, class_arm, is_active) VALUES (?, ?, ?, ?, 1)`)
        .run(id, name, className, arm);

    const insFee = (id, billed, paid, status) =>
      db.prepare(`INSERT INTO student_fees (student_id, academic_session, term, total_billed, total_paid, status) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, SES, TERM, billed, paid, status);

    const insAdj = (id, amount) =>
      db.prepare(`INSERT INTO fee_adjustments (student_id, academic_session, term, adjustment_type, description, amount) VALUES (?, ?, ?, 'scholarship', 'Staff Scholarship', ?)`)
        .run(id, SES, TERM, amount);

    const getPersisted = (id) =>
      db.prepare(`SELECT total_billed, total_paid, status FROM student_fees WHERE student_id = ? AND academic_session = ? AND term = ?`)
        .get(id, SES, TERM);

    it('fixes CLAIRE Zamani (₦32k), Erica Jonathan (₦24k), and Melvin Lot (₦24k) in student_fees without losing Eunice Yakubu (₦41k)', () => {
      insStu('STU-061', 'CLAIRE Zamani', 'Learning to Read', 'ACE');
      insFee('STU-061', 81000, 0, 'unpaid'); // previously corrupted ₦98k - ₦17k
      insAdj('STU-061', 17000);

      insStu('STU-031', 'Erica Jonathan', 'Reading Readiness 2', 'B');
      insFee('STU-031', 65000, 0, 'unpaid'); // previously corrupted ₦82k - ₦17k
      insAdj('STU-031', 17000);

      insStu('STU-048', 'Melvin Kuzayet Lot', 'Reading Readiness 2', 'A');
      insFee('STU-048', 65000, 12000, 'partial'); // previously reverted on startup
      insAdj('STU-048', 17000);

      insStu('STU-033', 'Eunice Yakubu', 'Reading Readiness 2', '');
      insFee('STU-033', 41000, 0, 'unpaid'); // sole un-armed active student

      insStu('STU-0IRYEG5V', 'Bright Samuel', 'Reading Readiness 2', 'A');
      const extraRes = db.prepare(`INSERT INTO fee_extras (class_name, item_name, amount, term, is_active) VALUES ('Reading Readiness 2', 'Uniform Package', 6000, 'All Terms', 1)`).run();
      db.prepare(`INSERT INTO student_extra_selections (student_id, extra_id, academic_session, term) VALUES ('STU-0IRYEG5V', ?, ?, ?)`).run(extraRes.lastInsertRowid, SES, TERM);
      insFee('STU-0IRYEG5V', 88000, 70000, 'partial');

      insStu('STU-MIL', 'Millicent Emmanuel', 'JSS 2', '');
      insAdj('STU-MIL', 58000); // full scholarship, no existing student_fees row yet

      db.transaction(() => {
        recalculateStudentTotalBilled(db, 'STU-061', SES, TERM);
        recalculateStudentTotalBilled(db, 'STU-031', SES, TERM);
        recalculateStudentTotalBilled(db, 'STU-048', SES, TERM);
        recalculateStudentTotalBilled(db, 'STU-033', SES, TERM);
        recalculateStudentTotalBilled(db, 'STU-0IRYEG5V', SES, TERM);
        recalculateStudentTotalBilled(db, 'STU-MIL', SES, TERM);
      })();

      expect(getPersisted('STU-061')).toEqual({ total_billed: 32000, total_paid: 0, status: 'unpaid' });
      expect(getPersisted('STU-031')).toEqual({ total_billed: 24000, total_paid: 0, status: 'unpaid' });
      expect(getPersisted('STU-048')).toEqual({ total_billed: 24000, total_paid: 12000, status: 'partial' });
      expect(getPersisted('STU-033')).toEqual({ total_billed: 41000, total_paid: 0, status: 'unpaid' });
      expect(getPersisted('STU-0IRYEG5V')).toEqual({ total_billed: 47000, total_paid: 70000, status: 'cleared' });
      expect(getPersisted('STU-MIL')).toEqual({ total_billed: 0, total_paid: 0, status: 'cleared' });

      // Idempotency check (simulates repeated app startup reconciliation)
      db.transaction(() => {
        recalculateStudentTotalBilled(db, 'STU-061', SES, TERM);
        recalculateStudentTotalBilled(db, 'STU-031', SES, TERM);
        recalculateStudentTotalBilled(db, 'STU-048', SES, TERM);
        recalculateStudentTotalBilled(db, 'STU-033', SES, TERM);
      })();

      expect(getPersisted('STU-061').total_billed).toBe(32000);
      expect(getPersisted('STU-031').total_billed).toBe(24000);
      expect(getPersisted('STU-048').total_billed).toBe(24000);
      expect(getPersisted('STU-033').total_billed).toBe(41000);
    });

    it('returns null when required params are missing', () => {
      expect(recalculateStudentTotalBilled(db, null, SES, TERM)).toBeNull();
      expect(recalculateStudentTotalBilled(db, 'STU-01', null, TERM)).toBeNull();
      expect(recalculateStudentTotalBilled(db, 'STU-01', SES, null)).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 5. WhatsApp sendFeeStatus — no duplicate breakdown items
  // ─────────────────────────────────────────────────────────────────
  describe('WhatsApp sendFeeStatus — duplicate bare+arm guard', () => {
    it('renders each fee item once and does not double estimatedTotal for armed students', async () => {
      db.prepare(`INSERT INTO students (id, name, class_name, class_arm, is_active) VALUES ('STU-061', 'CLAIRE Zamani', 'Learning to Read', 'ACE', 1)`).run();
      db.prepare(`INSERT INTO students (id, name, class_name, class_arm, is_active) VALUES ('STU-033', 'Eunice Yakubu', 'Reading Readiness 2', '', 1)`).run();
      // Only seed student_fees for CLAIRE; leave Eunice uninitialized to exercise estimatedTotal too
      db.prepare(`INSERT INTO student_fees (student_id, academic_session, term, total_billed, total_paid, status) VALUES ('STU-061', ?, ?, 32000, 0, 'unpaid')`).run(SES, TERM);

      let repliedText = '';
      const mockMsg = { reply: async (msg) => { repliedText = msg; } };
      const session = {
        schoolName: 'Potters Berean Christian Academy',
        termConfig: { academic_session: SES, term: TERM },
        students: [
          { id: 'STU-061', name: 'CLAIRE Zamani', class_name: 'Learning to Read', class_arm: 'ACE' },
          { id: 'STU-033', name: 'Eunice Yakubu', class_name: 'Reading Readiness 2', class_arm: '' },
        ],
      };

      await sendFeeStatus(mockMsg, session, null);

      // CLAIRE's breakdown items must NOT appear twice
      expect(repliedText.match(/Flags: ₦2,000/g)).toHaveLength(1);
      // Tuition appears once for CLAIRE (₦45k) and once for Eunice (₦30k)
      expect(repliedText.match(/Tuition: ₦45,000/g)).toHaveLength(1);
      expect(repliedText.match(/Tuition: ₦30,000/g)).toHaveLength(1);

      // Billed & estimated amounts remain accurate
      expect(repliedText).toContain('Billed : ₦32,000');
      expect(repliedText).toContain('Billed : ₦41,000');
      expect(repliedText).not.toContain('₦98,000');
      expect(repliedText).not.toContain('₦82,000');
    });
  });
});
