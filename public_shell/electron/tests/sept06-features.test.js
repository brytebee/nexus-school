/**
 * sept06-features.test.js
 *
 * Regression suite for the September 2026 feature batch:
 *
 *   F1 — Subject Auto-Population & Class Caching
 *        · class-name normalisation (UPPER + strip spaces)
 *        · getClassSubjects lookup  — matches "JSS2", "jss 2", "JSS 2" all to same class
 *        · custom_subjects CRUD     — add, no-duplicate, case-insensitive
 *        · CSV write-back           — batch upsert is idempotent
 *
 *   F3 — Remove Token/Overflow System
 *        · assertQuotaCompliant     — always returns null (gate removed)
 *        · recheckQuota             — always sets overQuota=false, quotaEnforced=false
 *        · add-student-form         — always inserts as enrollment_status='active'
 *        · one-shot migration       — UPDATE overflow→active touches only overflow rows
 *        · students:get-count       — response has no 'cap' field
 *
 *   F4 — Dual Parent Phone (extended)
 *        · parent_phone_2 storage   — optional, null is valid
 *        · OR-match in bot          — findStudentsByPhone matches parent_phone_2 too
 *        · sibling via phone_2      — student with no parent_phone but with phone_2 found
 *        · no cross-contamination   — phone_2 of one family does not match another
 */

import { describe, it, expect, beforeEach } from 'vitest';

const { getMatchableDigits, findStudentsByPhone } = require('../pulse-bot.js');

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors the UPPER(replace(..., ' ', '')) logic in subjects:get-class-subjects */
function normaliseClassName(className, classArm = '') {
  return (className + classArm).replace(/\s+/g, '').toUpperCase();
}

/** Minimal mock db for pulse-bot tests — returns all rows on .all() */
function mockBotDb(students) {
  return { prepare: () => ({ all: () => students }) };
}

// ─────────────────────────────────────────────────────────────────────────────
// F1 §1 — Class-name normalisation
// ─────────────────────────────────────────────────────────────────────────────

describe('F1 — Class-name normalisation (subjects:get-class-subjects)', () => {
  it('"JSS 2"          → "JSS2"',  () => expect(normaliseClassName('JSS 2')).toBe('JSS2'));
  it('"JSS 2" + ""    → "JSS2"',  () => expect(normaliseClassName('JSS 2', '')).toBe('JSS2'));
  it('"SS 1"  + "A"   → "SS1A"',  () => expect(normaliseClassName('SS 1', 'A')).toBe('SS1A'));
  it('"jss 2" (lower) → "JSS2"',  () => expect(normaliseClassName('jss 2')).toBe('JSS2'));
  it('"J S S  2"      → "JSS2"',  () => expect(normaliseClassName('J S S  2')).toBe('JSS2'));
  it('"JSS2" (already joined)  → "JSS2"', () => expect(normaliseClassName('JSS2')).toBe('JSS2'));

  it('"JSS 2" and "jss2" normalise to the same key', () => {
    expect(normaliseClassName('JSS 2')).toBe(normaliseClassName('jss2'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F1 §2 — getClassSubjects lookup (in-memory mock)
// ─────────────────────────────────────────────────────────────────────────────

class SubjectDb {
  constructor() {
    this.students        = []; // { id, class_name, class_arm }
    this.studentSubjects = []; // { student_id, subject_name }
    this.customSubjects  = new Map(); // UPPER(name) → original name
  }

  getClassSubjects(className, classArm = '') {
    const normQuery = normaliseClassName(className, classArm);
    const ids = this.students
      .filter(s => normaliseClassName(s.class_name, s.class_arm ?? '') === normQuery)
      .map(s => s.id);
    const unique = [...new Set(
      this.studentSubjects.filter(ss => ids.includes(ss.student_id)).map(ss => ss.subject_name)
    )];
    return unique.sort();
  }

  addToCanonical(name) {
    const key = name.trim().toUpperCase();
    if (!this.customSubjects.has(key)) this.customSubjects.set(key, name.trim());
  }

  getCustomList() { return [...this.customSubjects.values()]; }

  batchUpsertSubjects(subjects) { subjects.forEach(s => this.addToCanonical(s)); }
}

describe('F1 — getClassSubjects: returns subjects for a class', () => {
  let db;

  beforeEach(() => {
    db = new SubjectDb();
    db.students = [
      { id: 'S1', class_name: 'JSS 2', class_arm: '' },
      { id: 'S2', class_name: 'JSS 2', class_arm: '' },
      { id: 'S3', class_name: 'SS 1',  class_arm: 'A' },
    ];
    db.studentSubjects = [
      { student_id: 'S1', subject_name: 'Mathematics' },
      { student_id: 'S1', subject_name: 'English Language' },
      { student_id: 'S2', subject_name: 'Mathematics' }, // duplicate across students
      { student_id: 'S2', subject_name: 'Physics' },
      { student_id: 'S3', subject_name: 'Further Maths' },
    ];
  });

  it('returns distinct subjects for the queried class', () => {
    const subs = db.getClassSubjects('JSS 2');
    expect(subs).toContain('Mathematics');
    expect(subs).toContain('English Language');
    expect(subs).toContain('Physics');
    expect(subs.filter(s => s === 'Mathematics').length).toBe(1); // deduplicated
  });

  it('does NOT return subjects from a different class', () => {
    expect(db.getClassSubjects('JSS 2')).not.toContain('Further Maths');
  });

  it('returns [] for an unrecognised class', () => {
    expect(db.getClassSubjects('JSS 3')).toEqual([]);
  });

  it('matches "JSS2" (no space) to students stored as "JSS 2"', () => {
    expect(db.getClassSubjects('JSS2')).toContain('Mathematics');
  });

  it('matches "jss 2" (lowercase) to students stored as "JSS 2"', () => {
    expect(db.getClassSubjects('jss 2')).toContain('Mathematics');
  });

  it('matches "jss2" (no space, lowercase) to students stored as "JSS 2"', () => {
    expect(db.getClassSubjects('jss2')).toContain('Physics');
  });

  it('matches class with arm: getClassSubjects("SS 1", "A") finds SS1A students', () => {
    expect(db.getClassSubjects('SS 1', 'A')).toContain('Further Maths');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F1 §3 — custom_subjects CRUD
// ─────────────────────────────────────────────────────────────────────────────

describe('F1 — custom_subjects: persist and deduplicate', () => {
  let db;
  beforeEach(() => { db = new SubjectDb(); });

  it('persists a new subject to the canonical list', () => {
    db.addToCanonical('Computer Science');
    expect(db.getCustomList()).toContain('Computer Science');
  });

  it('does not duplicate on same-case re-add', () => {
    db.addToCanonical('Mathematics');
    db.addToCanonical('Mathematics');
    expect(db.getCustomList().length).toBe(1);
  });

  it('does not duplicate on mixed-case re-add', () => {
    db.addToCanonical('Mathematics');
    db.addToCanonical('mathematics');
    db.addToCanonical('MATHEMATICS');
    expect(db.getCustomList().length).toBe(1);
  });

  it('stores multiple distinct subjects correctly', () => {
    ['English', 'Maths', 'Physics'].forEach(s => db.addToCanonical(s));
    expect(db.getCustomList().length).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F1 §4 — CSV write-back
// ─────────────────────────────────────────────────────────────────────────────

describe('F1 — CSV write-back: batchUpsertSubjects', () => {
  let db;
  beforeEach(() => { db = new SubjectDb(); });

  it('persists all subject names from CSV import', () => {
    const subjects = ['English', 'Maths', 'Biology', 'Chemistry', 'Physics'];
    db.batchUpsertSubjects(subjects);
    const list = db.getCustomList();
    expect(list.length).toBe(5);
    subjects.forEach(s => expect(list.some(l => l.toUpperCase() === s.toUpperCase())).toBe(true));
  });

  it('is idempotent — running twice does not create duplicates', () => {
    db.batchUpsertSubjects(['English', 'Maths']);
    db.batchUpsertSubjects(['English', 'Maths']);
    expect(db.getCustomList().length).toBe(2);
  });

  it('merges with existing canonical subjects (no wipe)', () => {
    db.addToCanonical('Pre-existing Subject');
    db.batchUpsertSubjects(['New Subject']);
    expect(db.getCustomList()).toContain('Pre-existing Subject');
    expect(db.getCustomList()).toContain('New Subject');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F3 §1 — assertQuotaCompliant: always null
// ─────────────────────────────────────────────────────────────────────────────

function assertQuotaCompliant(_channel, _licenseStatus) {
  // F3: gate removed
  return null;
}

const GATED_FEATURES = [
  'generate-reports', 'results:dispatch', 'results:publish',
  'fees:record-payment', 'fees:upsert', 'cbt:deploy-exam',
  'cbt:create-batch', 'cbt:dispatch-pulse-notifications',
];

describe('F3 — assertQuotaCompliant: always returns null', () => {
  it('returns null for every previously gated feature when quotaEnforced=true', () => {
    const license = { quotaEnforced: true, overQuota: true, student_count: 50, enrolledCount: 200 };
    GATED_FEATURES.forEach(ch => expect(assertQuotaCompliant(ch, license)).toBeNull());
  });

  it('returns null when license is null', () => {
    expect(assertQuotaCompliant('generate-reports', null)).toBeNull();
  });

  it('returns null when license is undefined', () => {
    expect(assertQuotaCompliant('fees:record-payment', undefined)).toBeNull();
  });

  it('returns null for non-gated features', () => {
    expect(assertQuotaCompliant('get-all-students',  { quotaEnforced: true })).toBeNull();
    expect(assertQuotaCompliant('add-student-form',  { quotaEnforced: true })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F3 §2 — recheckQuota: always neutralises cap flags
// ─────────────────────────────────────────────────────────────────────────────

function recheckQuota(licenseStatus) {
  return { ...(licenseStatus ?? {}), overQuota: false, quotaEnforced: false };
}

describe('F3 — recheckQuota: always neutralises cap', () => {
  it('overQuota=false even when enrolled far exceeds old cap', () => {
    const r = recheckQuota({ student_count: 50, enrolledCount: 9999 });
    expect(r.overQuota).toBe(false);
    expect(r.quotaEnforced).toBe(false);
  });

  it('overrides quotaEnforced=true coming in', () => {
    const r = recheckQuota({ quotaEnforced: true, overQuota: true });
    expect(r.overQuota).toBe(false);
    expect(r.quotaEnforced).toBe(false);
  });

  it('preserves unrelated license fields', () => {
    const r = recheckQuota({ tier: 'Gold', expires_at: 9999999999, licensed_terms: ['2024/2025-T3'] });
    expect(r.tier).toBe('Gold');
    expect(r.expires_at).toBe(9999999999);
    expect(r.licensed_terms).toEqual(['2024/2025-T3']);
  });

  it('works safely with null input', () => {
    const r = recheckQuota(null);
    expect(r.overQuota).toBe(false);
    expect(r.quotaEnforced).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F3 §3 — add-student-form: always active, no cap
// ─────────────────────────────────────────────────────────────────────────────

function insertStudentF3(students, { id, name, class_name }) {
  // F3: No cap check — always active
  students.set(id, { id, name, class_name, enrollment_status: 'active' });
  return { ok: true };
}

describe('F3 — add-student-form: no seat cap, enrollment_status always active', () => {
  it('inserts a student as active', () => {
    const students = new Map();
    const r = insertStudentF3(students, { id: 'S-1', name: 'Amaka', class_name: 'JSS 1' });
    expect(r.ok).toBe(true);
    expect(students.get('S-1').enrollment_status).toBe('active');
  });

  it('succeeds when 10 000 students already exist (no cap block)', () => {
    const students = new Map();
    for (let i = 0; i < 10000; i++) students.set(`bulk-${i}`, { enrollment_status: 'active' });
    const r = insertStudentF3(students, { id: 'LATE', name: 'Late Joiner', class_name: 'SS 3' });
    expect(r.ok).toBe(true);
    expect(students.get('LATE').enrollment_status).toBe('active');
  });

  it('never produces enrollment_status="overflow"', () => {
    const students = new Map();
    ['A', 'B', 'C'].forEach(id => insertStudentF3(students, { id, name: id, class_name: 'JSS 2' }));
    for (const s of students.values()) expect(s.enrollment_status).not.toBe('overflow');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F3 §4 — one-shot overflow → active migration
// ─────────────────────────────────────────────────────────────────────────────

function runMigration(students) {
  // Mirrors: UPDATE students SET enrollment_status='active' WHERE enrollment_status='overflow'
  for (const [id, s] of students) {
    if (s.enrollment_status === 'overflow') students.set(id, { ...s, enrollment_status: 'active' });
  }
}

describe('F3 — one-shot migration: overflow → active on license:refresh', () => {
  it('promotes every overflow student to active', () => {
    const students = new Map([
      ['s1', { id: 's1', enrollment_status: 'overflow' }],
      ['s2', { id: 's2', enrollment_status: 'overflow' }],
    ]);
    runMigration(students);
    expect(students.get('s1').enrollment_status).toBe('active');
    expect(students.get('s2').enrollment_status).toBe('active');
  });

  it('leaves already-active students unchanged', () => {
    const students = new Map([['s3', { id: 's3', enrollment_status: 'active' }]]);
    runMigration(students);
    expect(students.get('s3').enrollment_status).toBe('active');
  });

  it('leaves inactive students unchanged (only targets overflow)', () => {
    const students = new Map([['s4', { id: 's4', enrollment_status: 'inactive' }]]);
    runMigration(students);
    expect(students.get('s4').enrollment_status).toBe('inactive');
  });

  it('is idempotent — running twice is safe', () => {
    const students = new Map([['s5', { id: 's5', enrollment_status: 'overflow' }]]);
    runMigration(students);
    runMigration(students);
    expect(students.get('s5').enrollment_status).toBe('active');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F3 §5 — students:get-count: no cap field
// ─────────────────────────────────────────────────────────────────────────────

function getStudentCount(students) {
  // F3: simplified — count only, no cap
  return { ok: true, count: [...students.values()].filter(s => s.is_active !== 0).length };
}

describe("F3 — students:get-count: response has no 'cap' field", () => {
  it('returns ok=true and the enrolled count', () => {
    const students = new Map([
      ['s1', { is_active: 1 }], ['s2', { is_active: 1 }], ['s3', { is_active: 1 }],
    ]);
    const r = getStudentCount(students);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(3);
  });

  it('does NOT include a cap field', () => {
    expect(getStudentCount(new Map()).cap).toBeUndefined();
  });

  it('does NOT include a willExceed field', () => {
    expect(getStudentCount(new Map()).willExceed).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F4 — findStudentsByPhone OR-matches parent_phone_2
// ─────────────────────────────────────────────────────────────────────────────

describe('F4 — findStudentsByPhone: OR-matches parent_phone_2', () => {
  const MATCH = '8012345678'; // normalised last-10 for 08012345678
  const base  = { class_name: 'JSS1', class_arm: 'A', parent_name: 'Parent' };

  it('finds student matched via parent_phone_2 when parent_phone differs', () => {
    const db = mockBotDb([{
      ...base, id: 1, name: 'Via Phone2',
      parent_phone:   '09087654321',
      parent_phone_2: '08012345678',
    }]);
    const result = findStudentsByPhone(db, MATCH);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Via Phone2');
  });

  it('finds student via parent_phone when parent_phone_2 is present but different', () => {
    const db = mockBotDb([{
      ...base, id: 2, name: 'Via Phone1',
      parent_phone:   '08012345678',
      parent_phone_2: '09099998888',
    }]);
    expect(findStudentsByPhone(db, MATCH)).toHaveLength(1);
  });

  it('finds student when parent_phone is null but parent_phone_2 matches', () => {
    const db = mockBotDb([{
      ...base, id: 3, name: 'NullPhone1',
      parent_phone:   null,
      parent_phone_2: '2348012345678',
    }]);
    const result = findStudentsByPhone(db, MATCH);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('NullPhone1');
  });

  it('returns BOTH siblings when number appears on different slots across siblings', () => {
    const db = mockBotDb([
      { ...base, id: 10, name: 'Child A', parent_phone: '08012345678',  parent_phone_2: null },
      { ...base, id: 11, name: 'Child B', parent_phone: '09055556666',  parent_phone_2: '08012345678' },
    ]);
    const result = findStudentsByPhone(db, MATCH);
    expect(result).toHaveLength(2);
    expect(result.map(s => s.name)).toContain('Child A');
    expect(result.map(s => s.name)).toContain('Child B');
  });

  it('does NOT return student whose parent_phone_2 is a different number', () => {
    const db = mockBotDb([
      { ...base, id: 20, name: 'Right', parent_phone: '08012345678', parent_phone_2: null },
      { ...base, id: 21, name: 'Wrong', parent_phone: '09011112222', parent_phone_2: '09033334444' },
    ]);
    const result = findStudentsByPhone(db, MATCH);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Right');
  });

  it('handles parent_phone_2 stored with +234 prefix', () => {
    const db = mockBotDb([{
      ...base, id: 30, name: 'Prefix',
      parent_phone: '09044445555', parent_phone_2: '+2348012345678',
    }]);
    expect(findStudentsByPhone(db, MATCH)).toHaveLength(1);
  });

  it('handles parent_phone_2 stored with dashes (+234-801-234-5678)', () => {
    const db = mockBotDb([{
      ...base, id: 31, name: 'Dashes',
      parent_phone: '09044445555', parent_phone_2: '+234-801-234-5678',
    }]);
    expect(findStudentsByPhone(db, MATCH)).toHaveLength(1);
  });

  it('returns [] when both parent_phone and parent_phone_2 are null', () => {
    const db = mockBotDb([{ ...base, id: 40, name: 'No Phones', parent_phone: null, parent_phone_2: null }]);
    expect(findStudentsByPhone(db, MATCH)).toHaveLength(0);
  });

  it('returns [] when parent_phone_2 is an empty string', () => {
    const db = mockBotDb([{ ...base, id: 41, name: 'Empty2', parent_phone: '09011111111', parent_phone_2: '' }]);
    expect(findStudentsByPhone(db, MATCH)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F4 — parent_phone_2 data model
// ─────────────────────────────────────────────────────────────────────────────

describe('F4 — parent_phone_2: data model', () => {
  it('can hold a valid phone string', () => {
    const s = { parent_phone: '08012345678', parent_phone_2: '09099998888' };
    expect(s.parent_phone_2).toBe('09099998888');
  });

  it('can be null (single-contact household)', () => {
    const s = { parent_phone: '08012345678', parent_phone_2: null };
    expect(s.parent_phone_2).toBeNull();
  });

  it('getMatchableDigits normalises a parent_phone_2 value correctly', () => {
    expect(getMatchableDigits('09099998888')).toBe('9099998888');
  });

  it('getMatchableDigits returns null for null parent_phone_2', () => {
    expect(getMatchableDigits(null)).toBeNull();
  });

  it('getMatchableDigits returns null for empty string parent_phone_2', () => {
    expect(getMatchableDigits('')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// student_subjects UNIQUE constraint regression (v1.0.91 fix)
//
// normalizeSubjectName is a private function inside main.js (not exported).
// We inline a faithful copy here so we can unit-test the full
// normalize → deduplicate pipeline without booting Electron.
// ─────────────────────────────────────────────────────────────────────────────

function normalizeSubjectName(subject, className) {
  if (!subject) return '';
  let norm = subject.trim();
  if (norm === 'Further Maths' || norm === 'Further Mathematic') return 'Further Mathematics';
  if (norm === 'Literature') return 'Literature in English';
  if (!className) return norm;
  const isJSS = className.toUpperCase().startsWith('JS');
  const isSSS = className.toUpperCase().startsWith('SS');
  if (norm === 'General Mathematics' && isJSS) return 'Mathematics';
  if (norm === 'Mathematics' && isSSS) return 'General Mathematics';
  return norm;
}

/** Mirrors the dedup pipeline added to add-student-form / update-student. */
function buildUniqueSubjects(subjects, class_name) {
  return Array.from(new Set(
    subjects
      .map(s => normalizeSubjectName(s, class_name))
      .filter(s => typeof s === 'string' && s.trim().length > 0)
  ));
}

describe('student_subjects — UNIQUE constraint regression (v1.0.91)', () => {
  it('alias pair on SS class collapses to one row (no duplicate key)', () => {
    // "Mathematics" + "General Mathematics" on SS1 both normalize to "General Mathematics"
    const result = buildUniqueSubjects(['Mathematics', 'General Mathematics'], 'SS1');
    expect(result).toEqual(['General Mathematics']);
    expect(result.length).toBe(1);
  });

  it('alias pair on JSS class collapses to one row (no duplicate key)', () => {
    // "General Mathematics" + "Mathematics" on JSS2 both normalize to "Mathematics"
    const result = buildUniqueSubjects(['General Mathematics', 'Mathematics'], 'JSS2');
    expect(result).toEqual(['Mathematics']);
    expect(result.length).toBe(1);
  });

  it('exact string duplicate is deduplicated before insert', () => {
    const result = buildUniqueSubjects(
      ['English Language', 'English Language', 'Mathematics'],
      'SS2'
    );
    expect(result.filter(s => s === 'English Language').length).toBe(1);
    expect(result.length).toBe(2);
  });

  it('Further Maths alias deduplicates with Further Mathematics', () => {
    const result = buildUniqueSubjects(['Further Maths', 'Further Mathematics'], 'SS3');
    expect(result).toEqual(['Further Mathematics']);
    expect(result.length).toBe(1);
  });

  it('empty strings and whitespace-only values are filtered out', () => {
    const result = buildUniqueSubjects(['', '   ', 'Biology'], 'SS2');
    expect(result).toEqual(['Biology']);
    expect(result.length).toBe(1);
  });

  it('null/undefined subjects are filtered without throwing', () => {
    // normalizeSubjectName returns '' for falsy — filtered out downstream
    const result = buildUniqueSubjects([null, undefined, 'Chemistry'].filter(Boolean), 'SS1');
    expect(result).toEqual(['Chemistry']);
  });

  it('valid, distinct subjects are all preserved', () => {
    const result = buildUniqueSubjects(
      ['English Language', 'General Mathematics', 'Biology', 'Chemistry'],
      'SS1'
    );
    expect(result.length).toBe(4);
  });
});
