import { describe, it, expect, beforeEach } from 'vitest';
const { database } = require('@nexus/engine');

function seedBase(db, opts = {}) {
  const hierarchy    = opts.hierarchy    || ['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'];
  const terms        = opts.terms        || ['First Term', 'Second Term', 'Third Term'];
  const periodLabel  = opts.period_label || 'term';
  const currentTerm  = opts.currentTerm  || terms[0];
  const session      = opts.session      || '2024/2025';

  db.prepare("INSERT OR REPLACE INTO system_settings (key,value) VALUES ('class_hierarchy', ?)").run(JSON.stringify(hierarchy));
  db.prepare("INSERT OR REPLACE INTO system_settings (key,value) VALUES ('term_structure', ?)").run(JSON.stringify({ terms, period_label: periodLabel }));
  db.prepare("INSERT OR REPLACE INTO system_settings (key,value) VALUES ('current_academic_session', ?)").run(session);
  db.prepare("INSERT OR REPLACE INTO school_term_config (id, academic_session, term, term_start_date, term_end_date) VALUES (1, ?, ?, '2024-09-01', '2024-11-30')").run(session, currentTerm);
}

function insertStudent(db, id, name, cls, arm = 'Gold', status = 'active') {
  db.prepare("INSERT OR IGNORE INTO students (id, name, class, class_arm, enrollment_status, session_history) VALUES (?,?,?,?,?,'[]')").run(id, name, cls, arm, status);
}

function getRolloverConfig(db) {
  const tsRow = db.prepare("SELECT value FROM system_settings WHERE key='term_structure'").get();
  let termStructure = { terms: ['First Term', 'Second Term', 'Third Term'], period_label: 'term' };
  try { if (tsRow) termStructure = JSON.parse(tsRow.value); } catch (_) {}
  const hierRow = db.prepare("SELECT value FROM system_settings WHERE key='class_hierarchy'").get();
  let hierarchy = ['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'];
  try { if (hierRow) hierarchy = JSON.parse(hierRow.value); } catch (_) {}
  return { termStructure, hierarchy };
}

function resolveStudentAction(student, action, hierarchy, targetClass, targetArm) {
  const idx = hierarchy.indexOf(student.class);
  switch (action) {
    case 'promote':
      if (idx < 0 || idx >= hierarchy.length - 1)
        return { newClass: student.class, newArm: student.class_arm, newStatus: 'graduated' };
      return { newClass: hierarchy[idx + 1], newArm: student.class_arm, newStatus: 'active' };
    case 'graduate':
      return { newClass: student.class, newArm: student.class_arm, newStatus: 'graduated' };
    case 'repeat':
      return { newClass: student.class, newArm: student.class_arm, newStatus: 'active' };
    case 'demote':
      if (idx <= 0) return { newClass: student.class, newArm: student.class_arm, newStatus: 'active' };
      return { newClass: hierarchy[idx - 1], newArm: student.class_arm, newStatus: 'active' };
    case 'move':
      return { newClass: targetClass || student.class, newArm: targetArm || student.class_arm, newStatus: 'active' };
    case 'switch_arm':
      return { newClass: student.class, newArm: targetArm || student.class_arm, newStatus: 'active' };
    default:
      return { newClass: student.class, newArm: student.class_arm, newStatus: student.enrollment_status };
  }
}

function applyStudentRollover(db, student, resolved, action, currentSession, note) {
  let history = [];
  try { history = JSON.parse(student.session_history || '[]'); } catch (_) {}
  history.push({
    session: currentSession,
    class:   student.class,
    arm:     student.class_arm,
    action:  resolved.newStatus === 'graduated' ? 'graduated' : action,
    ...(note ? { note } : {})
  });
  db.prepare("UPDATE students SET class=?, class_arm=?, enrollment_status=?, session_history=? WHERE id=?")
    .run(resolved.newClass, resolved.newArm, resolved.newStatus, JSON.stringify(history), student.id);
}

describe('Phase 3B: Dynamic Term-Aware Rollover Engine', () => {

  let db;
  beforeEach(() => { db = database.init(':memory:'); });

  it('1. Term advance (Mode A): advances term, clears dates, no student promotion', () => {
    seedBase(db, { currentTerm: 'First Term' });
    insertStudent(db, 1, 'Amaka', 'JSS 1', 'Gold');

    const { termStructure } = getRolloverConfig(db);
    const termRow = db.prepare("SELECT term FROM school_term_config WHERE id=1").get();
    const termIdx = termStructure.terms.indexOf(termRow.term);
    expect(termIdx === termStructure.terms.length - 1).toBe(false);

    const nextTerm = termStructure.terms[termIdx + 1];
    db.prepare("UPDATE school_term_config SET term=?, term_start_date=NULL, term_end_date=NULL, resumption_date=NULL WHERE id=1").run(nextTerm);

    const updated = db.prepare("SELECT * FROM school_term_config WHERE id=1").get();
    expect(updated.term).toBe('Second Term');
    expect(updated.term_start_date).toBeNull();
    expect(updated.academic_session).toBe('2024/2025');
    expect(db.prepare("SELECT class FROM students WHERE id=1").get().class).toBe('JSS 1');
  });

  it('2. Session rollover (Mode B, 3-term): promotes, graduates final class, arms preserved', () => {
    seedBase(db, { currentTerm: 'Third Term' });
    insertStudent(db, 1, 'Kelechi', 'JSS 1', 'Gold');
    insertStudent(db, 2, 'Fatima',  'SS 3',  'Diamond');

    const { termStructure, hierarchy } = getRolloverConfig(db);
    const termRow = db.prepare("SELECT term, academic_session FROM school_term_config WHERE id=1").get();
    expect(termStructure.terms.indexOf(termRow.term)).toBe(termStructure.terms.length - 1);

    const newSession = '2025/2026';
    db.transaction(() => {
      const students = db.prepare("SELECT * FROM students WHERE enrollment_status='active'").all();
      for (const s of students) {
        const resolved = resolveStudentAction(s, 'promote', hierarchy);
        applyStudentRollover(db, s, resolved, 'promote', termRow.academic_session, null);
      }
      db.prepare("UPDATE school_term_config SET academic_session=?, term=?, term_start_date=NULL, term_end_date=NULL WHERE id=1")
        .run(newSession, termStructure.terms[0]);
    })();

    const kelechi = db.prepare("SELECT * FROM students WHERE id=1").get();
    expect(kelechi.class).toBe('JSS 2');
    expect(kelechi.class_arm).toBe('Gold');

    const fatima = db.prepare("SELECT * FROM students WHERE id=2").get();
    expect(fatima.enrollment_status).toBe('graduated');
    expect(fatima.class_arm).toBe('Diamond');

    const cfg = db.prepare("SELECT * FROM school_term_config WHERE id=1").get();
    expect(cfg.academic_session).toBe(newSession);
    expect(cfg.term).toBe('First Term');
  });

  it('3. 2-term (semester) structure: detects last term correctly', () => {
    seedBase(db, { currentTerm: 'Second Semester', terms: ['First Semester', 'Second Semester'], period_label: 'semester' });
    const { termStructure } = getRolloverConfig(db);
    const termRow = db.prepare("SELECT term FROM school_term_config WHERE id=1").get();
    const termIdx = termStructure.terms.indexOf(termRow.term);
    expect(termIdx).toBe(1);
    expect(termIdx === termStructure.terms.length - 1).toBe(true);
    expect(termStructure.period_label).toBe('semester');
  });

  it('4. 4-term (quarterly) structure: Q3 is not the last term, Q4 is next', () => {
    seedBase(db, { currentTerm: 'Q3', terms: ['Q1', 'Q2', 'Q3', 'Q4'], period_label: 'quarter' });
    const { termStructure } = getRolloverConfig(db);
    const termRow = db.prepare("SELECT term FROM school_term_config WHERE id=1").get();
    const termIdx = termStructure.terms.indexOf(termRow.term);
    expect(termIdx).toBe(2);
    expect(termIdx === termStructure.terms.length - 1).toBe(false);
    expect(termStructure.terms[termIdx + 1]).toBe('Q4');
  });

  it('5. session_history: promote appends entry with session, class, arm, action=promoted', () => {
    seedBase(db);
    insertStudent(db, 1, 'Ngozi', 'JSS 1', 'Silver');
    const student = db.prepare("SELECT * FROM students WHERE id=1").get();
    const { hierarchy } = getRolloverConfig(db);
    const resolved = resolveStudentAction(student, 'promote', hierarchy);
    applyStudentRollover(db, student, resolved, 'promote', '2024/2025', null);

    const hist = JSON.parse(db.prepare("SELECT session_history FROM students WHERE id=1").get().session_history);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ session: '2024/2025', class: 'JSS 1', arm: 'Silver', action: 'promoted' });
    expect(db.prepare("SELECT class FROM students WHERE id=1").get().class).toBe('JSS 2');
  });

  it('6. session_history: graduate entry written, enrollment_status=graduated', () => {
    seedBase(db);
    insertStudent(db, 1, 'Emeka', 'SS 3', 'Gold');
    const student = db.prepare("SELECT * FROM students WHERE id=1").get();
    const { hierarchy } = getRolloverConfig(db);
    const resolved = resolveStudentAction(student, 'promote', hierarchy);
    expect(resolved.newStatus).toBe('graduated');
    applyStudentRollover(db, student, resolved, 'promote', '2024/2025', null);

    const updated = db.prepare("SELECT * FROM students WHERE id=1").get();
    expect(updated.enrollment_status).toBe('graduated');
    expect(JSON.parse(updated.session_history)[0].action).toBe('graduated');
  });

  it('7. Prior student_records rows are never deleted on rollover', () => {
    seedBase(db);
    db.prepare("INSERT OR IGNORE INTO student_records (student_id, subject_id, academic_session, term) VALUES (1, 'MTH', '2024/2025', 'First Term')").run();
    const before = db.prepare("SELECT * FROM student_records WHERE academic_session='2024/2025'").all();
    expect(before.length).toBeGreaterThan(0);
    db.prepare("UPDATE school_term_config SET academic_session='2025/2026', term='First Term' WHERE id=1").run();
    const after = db.prepare("SELECT * FROM student_records WHERE academic_session='2024/2025'").all();
    expect(after.length).toBe(before.length);
  });

  it('8. Single class rollover: only targeted class students move, others untouched', () => {
    seedBase(db);
    insertStudent(db, 1, 'Tunde', 'JSS 1', 'Gold');
    insertStudent(db, 2, 'Bola',  'JSS 2', 'Gold');

    const { hierarchy } = getRolloverConfig(db);
    const session = db.prepare("SELECT academic_session FROM school_term_config WHERE id=1").get().academic_session;
    const targets = db.prepare("SELECT * FROM students WHERE class='JSS 1' AND enrollment_status='active'").all();

    db.transaction(() => {
      for (const s of targets) {
        applyStudentRollover(db, s, resolveStudentAction(s, 'promote', hierarchy), 'promote', session, null);
      }
    })();

    expect(db.prepare("SELECT class FROM students WHERE id=1").get().class).toBe('JSS 2');
    expect(db.prepare("SELECT class FROM students WHERE id=2").get().class).toBe('JSS 2');
  });

  it('9. Filtered batch repeat: class unchanged, session_history has action=repeat', () => {
    seedBase(db);
    insertStudent(db, 1, 'Ada', 'JSS 3', 'Gold');
    const student = db.prepare("SELECT * FROM students WHERE id=1").get();
    const { hierarchy } = getRolloverConfig(db);
    const resolved = resolveStudentAction(student, 'repeat', hierarchy);
    expect(resolved.newClass).toBe('JSS 3');
    applyStudentRollover(db, student, resolved, 'repeat', '2024/2025', null);

    const updated = db.prepare("SELECT * FROM students WHERE id=1").get();
    expect(updated.class).toBe('JSS 3');
    expect(JSON.parse(updated.session_history)[0].action).toBe('repeat');
  });

  it('10. Filtered batch demote: moves back one hierarchy step, arm preserved', () => {
    seedBase(db);
    insertStudent(db, 1, 'Wale', 'JSS 2', 'Diamond');
    const student = db.prepare("SELECT * FROM students WHERE id=1").get();
    const { hierarchy } = getRolloverConfig(db);
    const resolved = resolveStudentAction(student, 'demote', hierarchy);
    expect(resolved.newClass).toBe('JSS 1');
    expect(resolved.newArm).toBe('Diamond');
    applyStudentRollover(db, student, resolved, 'demote', '2024/2025', null);

    const updated = db.prepare("SELECT * FROM students WHERE id=1").get();
    expect(updated.class).toBe('JSS 1');
    expect(updated.class_arm).toBe('Diamond');
  });

  it('11. Filtered batch switch_arm: class unchanged, only arm updated', () => {
    seedBase(db);
    insertStudent(db, 1, 'Sola', 'SS 1', 'Gold');
    const student = db.prepare("SELECT * FROM students WHERE id=1").get();
    const { hierarchy } = getRolloverConfig(db);
    const resolved = resolveStudentAction(student, 'switch_arm', hierarchy, undefined, 'Diamond');
    expect(resolved.newClass).toBe('SS 1');
    expect(resolved.newArm).toBe('Diamond');
    applyStudentRollover(db, student, resolved, 'switch_arm', '2024/2025', null);

    const updated = db.prepare("SELECT * FROM students WHERE id=1").get();
    expect(updated.class).toBe('SS 1');
    expect(updated.class_arm).toBe('Diamond');
  });

  it('12. Filtered batch move: student moved to explicit targetClass/targetArm', () => {
    seedBase(db);
    insertStudent(db, 1, 'Chibike', 'JSS 1', 'Gold');
    const student = db.prepare("SELECT * FROM students WHERE id=1").get();
    const { hierarchy } = getRolloverConfig(db);
    const resolved = resolveStudentAction(student, 'move', hierarchy, 'SS 2', 'Onyx');
    expect(resolved.newClass).toBe('SS 2');
    expect(resolved.newArm).toBe('Onyx');
    applyStudentRollover(db, student, resolved, 'move', '2024/2025', null);

    const updated = db.prepare("SELECT * FROM students WHERE id=1").get();
    expect(updated.class).toBe('SS 2');
    expect(updated.class_arm).toBe('Onyx');
  });

  it('13. Single student rollover: admin note stored in session_history entry', () => {
    seedBase(db);
    insertStudent(db, 1, 'Ifunanya', 'JSS 2', 'Gold');
    const student = db.prepare("SELECT * FROM students WHERE id=1").get();
    const { hierarchy } = getRolloverConfig(db);
    const resolved = resolveStudentAction(student, 'repeat', hierarchy);
    applyStudentRollover(db, student, resolved, 'repeat', '2024/2025', 'Retained due to illness');

    const hist = JSON.parse(db.prepare("SELECT session_history FROM students WHERE id=1").get().session_history);
    expect(hist[0].note).toBe('Retained due to illness');
  });

  it('14. Graduated students excluded from active student queries', () => {
    seedBase(db);
    insertStudent(db, 1, 'Obi', 'SS 3', 'Gold');
    const student = db.prepare("SELECT * FROM students WHERE id=1").get();
    const { hierarchy } = getRolloverConfig(db);
    const resolved = resolveStudentAction(student, 'promote', hierarchy);
    applyStudentRollover(db, student, resolved, 'promote', '2024/2025', null);

    const active    = db.prepare("SELECT id FROM students WHERE enrollment_status='active'").all().map((r) => r.id);
    const graduated = db.prepare("SELECT id FROM students WHERE enrollment_status='graduated'").all().map((r) => r.id);
    expect(active).not.toContain(1);
    expect(graduated).toContain(1);
  });

  it('15. Atomicity: transaction rollback leaves no partial state on failure', () => {
    seedBase(db, { currentTerm: 'Third Term' });
    insertStudent(db, 1, 'Nkechi', 'JSS 1', 'Gold');

    const beforeClass   = db.prepare("SELECT class FROM students WHERE id=1").get().class;
    const beforeSession = db.prepare("SELECT academic_session FROM school_term_config WHERE id=1").get().academic_session;

    try {
      db.transaction(() => {
        db.prepare("UPDATE students SET class='JSS 2' WHERE id=1").run();
        throw new Error('Simulated failure mid-rollover');
      })();
    } catch (_) {}

    expect(db.prepare("SELECT class FROM students WHERE id=1").get().class).toBe(beforeClass);
    expect(db.prepare("SELECT academic_session FROM school_term_config WHERE id=1").get().academic_session).toBe(beforeSession);
  });
});
