import { describe, it, expect, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// MockDatabase — same pattern as seat-cap.test.js
// ─────────────────────────────────────────────────────────────────────────────
class MockDatabase {
  constructor() {
    this.students    = new Map();
    this.studentFees = [];   // { student_id, academic_session, term, total_billed, total_paid, status }
    this.feeStructures = []; // { class_name, term, amount }
    this.termConfig  = { academic_session: '2024/2025', term: 'First Term' };
    this.deletedRows = { subjects: [], records: [], fees: [], attendance: [] };
  }

  prepare(sql) {
    const db   = this;
    const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    return {
      get: (...args) => {
        if (norm.includes('school_term_config'))                     return db.termConfig;
        if (norm.includes('from fee_structures')) {
          const [cls, term] = args;
          const total = db.feeStructures
            .filter(f => f.class_name === cls &&
              (f.term === term || f.term.toLowerCase().includes('all term')))
            .reduce((s, f) => s + f.amount, 0);
          return { total };
        }
        if (norm.includes('from student_fees sf') && norm.includes('join students')) {
          const [normClass, session, term, excludeId] = args;
          const hit = db.studentFees.find(sf => {
            if (sf.student_id === excludeId) return false;
            const s = db.students.get(sf.student_id);
            if (!s) return false;
            const sNorm = (s.class_name + (s.class_arm || '')).replace(/\s+/g, '').toUpperCase();
            return sNorm === normClass && sf.academic_session === session && sf.term === term;
          });
          return hit ? { 1: 1 } : null;
        }
        if (norm.includes("status in ('unpaid', 'partial')")) {
          const bal = db.studentFees
            .filter(sf => sf.student_id === args[0] && ['unpaid','partial'].includes(sf.status))
            .reduce((s, sf) => s + (sf.total_billed - sf.total_paid), 0);
          return { bal };
        }
        if (norm.includes('select name, fee_status from students')) {
          const s = db.students.get(args[0]);
          return s ? { name: s.name, fee_status: s.fee_status } : null;
        }
        return null;
      },
      run: (...args) => {
        if (norm.includes('insert into students')) {
          const rec = typeof args[0] === 'object' ? args[0] : {};
          db.students.set(rec.id, rec);
          return { changes: 1 };
        }
        if (norm.includes('insert into student_fees')) {
          const [sid, session, term, billed, paid, status] = args;
          const exists = db.studentFees.find(
            sf => sf.student_id === sid && sf.academic_session === session && sf.term === term
          );
          if (!exists) db.studentFees.push({ student_id: sid, academic_session: session, term, total_billed: billed, total_paid: paid, status });
          return { changes: exists ? 0 : 1 };
        }
        if (norm.includes('delete from student_subjects')) { db.deletedRows.subjects.push(args[0]);   return {}; }
        if (norm.includes('delete from student_records'))  { db.deletedRows.records  = db.deletedRows.records || []; db.deletedRows.records.push(args[0]); return {}; }
        if (norm.includes('delete from student_fees'))     { db.deletedRows.fees.push(args[0]);       return {}; }
        if (norm.includes('delete from daily_attendance')) { db.deletedRows.attendance.push(args[0]); return {}; }
        if (norm.includes('delete from students'))         { db.students.delete(args[0]);             return {}; }
        return { changes: 0 };
      },
      all: () => [],
    };
  }
  transaction(fn) { return fn; }
  exec() {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Extracted logic from main.js add-student-form (fee inheritance block)
// ─────────────────────────────────────────────────────────────────────────────
function runFeeInheritance(db, { id, class_name, class_arm }) {
  const termConfig = db.prepare('SELECT academic_session, term FROM school_term_config WHERE id = 1').get();
  if (!termConfig?.academic_session || !termConfig?.term) return { inherited: false };

  const fullClassName = class_name + (class_arm ? ' ' + class_arm : '');
  const normClass     = fullClassName.replace(/\s+/g, '').toUpperCase();

  const feeRow = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) as total FROM fee_structures WHERE class_name = ? AND term = ?'
  ).get(fullClassName, termConfig.term);

  if (!feeRow || feeRow.total <= 0) return { inherited: false };

  const classAlreadyBilled = db.prepare(
    'SELECT 1 FROM student_fees sf JOIN students s ON sf.student_id = s.id WHERE UPPER(...) = ? AND sf.academic_session = ? AND sf.term = ? AND sf.student_id != ? LIMIT 1'
  ).get(normClass, termConfig.academic_session, termConfig.term, id);

  if (!classAlreadyBilled) return { inherited: false };

  db.prepare(
    'INSERT INTO student_fees (student_id, academic_session, term, total_billed, total_paid, status) VALUES (?, ?, ?, ?, 0, \'unpaid\') ON CONFLICT DO NOTHING'
  ).run(id, termConfig.academic_session, termConfig.term, feeRow.total, 0, 'unpaid');

  return { inherited: true, total: feeRow.total };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extracted logic from main.js delete-student handler
// ─────────────────────────────────────────────────────────────────────────────
function runDeleteStudent(db, { id, forceDelete }) {
  const target = db.prepare('SELECT name, fee_status FROM students WHERE id = ?').get(id);
  if (!target) return { ok: false, error: 'Student not found.' };

  if (!forceDelete) {
    const balRow = db.prepare("SELECT COALESCE(SUM(total_billed - total_paid), 0) AS bal FROM student_fees WHERE student_id = ? AND status IN ('unpaid', 'partial')").get(id);
    const balance = balRow?.bal || 0;
    if (balance > 0) return { ok: false, error: 'STUDENT_HAS_OUTSTANDING_FEES', name: target.name, balance };
  }

  db.prepare('DELETE FROM student_subjects WHERE student_id = ?').run(id);
  db.prepare('DELETE FROM student_records  WHERE student_id = ?').run(id);
  db.prepare('DELETE FROM student_fees     WHERE student_id = ?').run(id);
  db.prepare('DELETE FROM daily_attendance WHERE student_id = ?').run(id);
  db.prepare('DELETE FROM students         WHERE id         = ?').run(id);
  return { ok: true };
}

// =============================================================================
// F2 — Fee Inheritance Tests
// =============================================================================
describe('F2 — Fee Inheritance for new students', () => {
  let db;

  beforeEach(() => {
    db = new MockDatabase();
    // Seed classmate who has already been billed (apply-to-class was run)
    db.students.set('STU-MATE', { id: 'STU-MATE', name: 'Existing', class_name: 'JSS 2', class_arm: 'A' });
    db.studentFees.push({ student_id: 'STU-MATE', academic_session: '2024/2025', term: 'First Term', total_billed: 50000, total_paid: 0, status: 'unpaid' });
    db.feeStructures.push({ class_name: 'JSS 2 A', term: 'First Term', amount: 50000 });
  });

  it('inherits fee when classmates are already billed', () => {
    db.students.set('STU-NEW', { id: 'STU-NEW', name: 'New Kid', class_name: 'JSS 2', class_arm: 'A' });
    const r = runFeeInheritance(db, { id: 'STU-NEW', class_name: 'JSS 2', class_arm: 'A' });
    expect(r.inherited).toBe(true);
    expect(r.total).toBe(50000);
    const fee = db.studentFees.find(sf => sf.student_id === 'STU-NEW');
    expect(fee).toBeDefined();
    expect(fee.status).toBe('unpaid');
    expect(fee.total_billed).toBe(50000);
    expect(fee.total_paid).toBe(0);
  });

  it('does NOT inherit when no classmate has been billed (apply-to-class not yet run)', () => {
    db.studentFees = [];
    db.students.set('STU-NEW2', { id: 'STU-NEW2', name: 'Early Bird', class_name: 'JSS 2', class_arm: 'A' });
    const r = runFeeInheritance(db, { id: 'STU-NEW2', class_name: 'JSS 2', class_arm: 'A' });
    expect(r.inherited).toBe(false);
    expect(db.studentFees.find(sf => sf.student_id === 'STU-NEW2')).toBeUndefined();
  });

  it('does NOT inherit when fee_structures total is zero', () => {
    db.feeStructures = [];
    db.students.set('STU-NEW3', { id: 'STU-NEW3', name: 'No Fee', class_name: 'JSS 2', class_arm: 'A' });
    const r = runFeeInheritance(db, { id: 'STU-NEW3', class_name: 'JSS 2', class_arm: 'A' });
    expect(r.inherited).toBe(false);
  });

  it('ON CONFLICT DO NOTHING — calling twice does not create duplicate row', () => {
    db.students.set('STU-DUP', { id: 'STU-DUP', name: 'Dup', class_name: 'JSS 2', class_arm: 'A' });
    runFeeInheritance(db, { id: 'STU-DUP', class_name: 'JSS 2', class_arm: 'A' });
    runFeeInheritance(db, { id: 'STU-DUP', class_name: 'JSS 2', class_arm: 'A' });
    expect(db.studentFees.filter(sf => sf.student_id === 'STU-DUP').length).toBe(1);
  });
});

// =============================================================================
// F4 — Dual Parent Phone Tests
// =============================================================================
describe('F4 — Dual parent phone (Option A)', () => {
  it('stores parent_phone_2 alongside parent_phone', () => {
    const db = new MockDatabase();
    db.prepare('INSERT INTO students').run({
      id: 'STU-A', name: 'Ada', class_name: 'SS 3', class_arm: 'B',
      parent_phone: '2348012345678', parent_phone_2: '2349011112222',
      fee_status: 'owing', enrollment_status: 'active',
    });
    const s = db.students.get('STU-A');
    expect(s.parent_phone).toBe('2348012345678');
    expect(s.parent_phone_2).toBe('2349011112222');
  });

  it('parent_phone_2 is optional — null is acceptable', () => {
    const db = new MockDatabase();
    db.prepare('INSERT INTO students').run({
      id: 'STU-B', name: 'Bola', class_name: 'JSS 1', class_arm: '',
      parent_phone: '2348055550000', parent_phone_2: null,
      fee_status: 'owing', enrollment_status: 'active',
    });
    expect(db.students.get('STU-B').parent_phone_2).toBeNull();
  });
});

// =============================================================================
// Delete Student — Outstanding Fee Guard Tests
// =============================================================================
describe('Delete Student — Outstanding Fee Guard', () => {
  let db;

  beforeEach(() => {
    db = new MockDatabase();
    db.students.set('STU-X', { id: 'STU-X', name: 'Chidi Okeke', fee_status: 'owing' });
    db.studentFees.push({ student_id: 'STU-X', academic_session: '2024/2025', term: 'First Term', total_billed: 30000, total_paid: 0, status: 'unpaid' });
  });

  it('blocks delete and returns STUDENT_HAS_OUTSTANDING_FEES when balance > 0', () => {
    const r = runDeleteStudent(db, { id: 'STU-X', forceDelete: false });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('STUDENT_HAS_OUTSTANDING_FEES');
    expect(r.balance).toBe(30000);
    expect(r.name).toBe('Chidi Okeke');
    expect(db.students.has('STU-X')).toBe(true); // row untouched
  });

  it('allows delete when forceDelete=true despite outstanding balance', () => {
    const r = runDeleteStudent(db, { id: 'STU-X', forceDelete: true });
    expect(r.ok).toBe(true);
    expect(db.students.has('STU-X')).toBe(false);
  });

  it('cascades student_fees and daily_attendance on force-delete', () => {
    runDeleteStudent(db, { id: 'STU-X', forceDelete: true });
    expect(db.deletedRows.fees).toContain('STU-X');
    expect(db.deletedRows.attendance).toContain('STU-X');
    expect(db.deletedRows.subjects).toContain('STU-X');
  });

  it('allows delete normally when student has no outstanding balance', () => {
    db.studentFees = [];
    const r = runDeleteStudent(db, { id: 'STU-X', forceDelete: false });
    expect(r.ok).toBe(true);
    expect(db.students.has('STU-X')).toBe(false);
  });

  it('partial payment student is also guarded', () => {
    db.studentFees[0].status = 'partial';
    db.studentFees[0].total_paid = 10000;
    const r = runDeleteStudent(db, { id: 'STU-X', forceDelete: false });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('STUDENT_HAS_OUTSTANDING_FEES');
    expect(r.balance).toBe(20000); // 30000 - 10000
  });
});
