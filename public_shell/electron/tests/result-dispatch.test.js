/**
 * tests/result-dispatch.test.js
 *
 * S10: Result Dispatch & PDF Pipeline Consistency
 *
 * Tests the pure logic layers of the result-dispatch pipeline:
 *   1.  Attendance contract   — student.attendance MUST be { total_days, days_attended }
 *   2.  Subject resolution    — registered vs unregistered, null-score seeding
 *   3.  Class name resolution — arm merge logic
 *   4.  Breakdown parsing     — safe JSON parse with fallbacks
 *   5.  Channel routing       — WA hard-block, email soft-block (queue)
 *   6.  Target ID resolution  — scope=student, scope=class, scope=all
 *   7.  termConfig contract   — required fields for template rendering
 *   8.  PDF payload contract  — shape matches generate-reports / query-results output
 *   9.  compileBatchAndUpload  — parentMap construction (no duplicate IDs per phone)
 *   10. Rate-limit guard      — dispatch result counters are mutually exclusive
 */

import { describe, it, expect } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Attendance Contract
//    The template (clean_slate.hbs line 177) reads:
//      {{student.attendance.days_attended}} / {{student.attendance.total_days}}
//    Flat scalars on the student object produce " / " — a hard-to-notice bug.
// ─────────────────────────────────────────────────────────────────────────────
describe('S10-1: Attendance object contract', () => {
  /**
   * Mirrors the shape assembled by report-assembler.assembleStudentsForReport
   * and the main.js query-results handler (lines 4002-4005).
   */
  function buildStudentAttendance({ totalDays, daysAttended }) {
    return {
      attendance: {
        total_days:    totalDays,
        days_attended: daysAttended,
      },
    };
  }

  it('attendance is a nested object, not a flat scalar', () => {
    const stu = buildStudentAttendance({ totalDays: 60, daysAttended: 55 });
    expect(stu.attendance).toBeTypeOf('object');
    expect(stu.attendance).not.toBeNull();
    expect(typeof stu.attendance).not.toBe('number');
  });

  it('template reads days_attended and total_days via dot notation', () => {
    const stu = buildStudentAttendance({ totalDays: 60, daysAttended: 55 });
    expect(stu.attendance.days_attended).toBe(55);
    expect(stu.attendance.total_days).toBe(60);
  });

  it('zeroes are preserved (0 ≠ null — "0/0" is correct, " / " is a bug)', () => {
    const stu = buildStudentAttendance({ totalDays: 0, daysAttended: 0 });
    // If these were null/undefined the template would render " / "
    expect(stu.attendance.total_days).toBe(0);
    expect(stu.attendance.days_attended).toBe(0);
    // Handlebars: {{0}} → "0", not empty — so "0/0" is the correct render
    expect(String(stu.attendance.days_attended)).toBe('0');
    expect(String(stu.attendance.total_days)).toBe('0');
  });

  it('flat scalars (the old bug) would produce empty strings in template', () => {
    // Demonstrate why the old bug caused " / "
    const buggyStudent = { attendance: 0, total_days: 0 }; // old incorrect shape
    // dot-notation on a number returns undefined
    expect(buggyStudent.attendance?.days_attended).toBeUndefined();
    expect(buggyStudent.attendance?.total_days).toBeUndefined();
    // Handlebars renders undefined as "" → template produces " / "
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Subject Resolution
//    Mirrors assembleStudentsForReport subject assembly:
//    registered subjects are seeded (score=null), then merged with records.
// ─────────────────────────────────────────────────────────────────────────────
describe('S10-2: Subject resolution', () => {
  function resolveSubjects(explicitSubjs, records) {
    const explicitSet      = new Set(explicitSubjs);
    const resolvedSubjects = new Map();

    // Seed registered subjects (no score yet)
    explicitSubjs.forEach(name =>
      resolvedSubjects.set(name, { name, score: null, breakdown: {}, isRegistered: true })
    );

    // Merge grade records; tag unregistered ones
    records.forEach(r =>
      resolvedSubjects.set(r.subject, {
        name:         r.subject,
        score:        r.score,
        breakdown:    {},
        isRegistered: explicitSet.has(r.subject),
      })
    );

    return Array.from(resolvedSubjects.values());
  }

  it('registered subjects with no records appear with score=null', () => {
    const subs = resolveSubjects(['Maths', 'English'], []);
    expect(subs).toHaveLength(2);
    expect(subs.every(s => s.score === null)).toBe(true);
    expect(subs.every(s => s.isRegistered)).toBe(true);
  });

  it('records merge into registered subjects, overriding null scores', () => {
    const subs = resolveSubjects(['Maths', 'English'], [
      { subject: 'Maths',   score: 72, breakdown: '{}' },
      { subject: 'English', score: 68, breakdown: '{}' },
    ]);
    expect(subs.find(s => s.name === 'Maths')?.score).toBe(72);
    expect(subs.find(s => s.name === 'English')?.score).toBe(68);
  });

  it('score records for unregistered subjects are included but tagged', () => {
    const subs = resolveSubjects(['Maths'], [
      { subject: 'Maths',    score: 72 },
      { subject: 'CRK',     score: 65 }, // not in explicit subjects
    ]);
    const crk = subs.find(s => s.name === 'CRK');
    expect(crk).toBeDefined();
    expect(crk?.isRegistered).toBe(false);
    expect(crk?.score).toBe(65);
  });

  it('no duplicate subjects when record exists for registered subject', () => {
    const subs = resolveSubjects(['Maths'], [{ subject: 'Maths', score: 80 }]);
    const mathsEntries = subs.filter(s => s.name === 'Maths');
    expect(mathsEntries).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Class Name Resolution (arm merge)
// ─────────────────────────────────────────────────────────────────────────────
describe('S10-3: Class name arm merge', () => {
  function mergeClassName(className, classArm) {
    return (classArm && !className.includes(classArm))
      ? `${className} ${classArm}`
      : className;
  }

  it('merges arm when not already present in class_name', () => {
    expect(mergeClassName('JSS 1', 'Ruby')).toBe('JSS 1 Ruby');
  });

  it('does not duplicate arm when already in class_name', () => {
    expect(mergeClassName('JSS 1 Ruby', 'Ruby')).toBe('JSS 1 Ruby');
  });

  it('returns class_name unchanged when no arm', () => {
    expect(mergeClassName('SS3', undefined)).toBe('SS3');
    expect(mergeClassName('SS3', null)).toBe('SS3');
    expect(mergeClassName('SS3', '')).toBe('SS3');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Breakdown Parsing
// ─────────────────────────────────────────────────────────────────────────────
describe('S10-4: parseBreakdown safety', () => {
  function parseBreakdown(raw) {
    try {
      const p = JSON.parse(raw);
      return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};
    } catch {
      return {};
    }
  }

  it('parses valid JSON breakdown objects', () => {
    const bd = parseBreakdown('{"CA1":10,"CA2":9.5,"Exam":45}');
    expect(bd.CA1).toBe(10);
    expect(bd.Exam).toBe(45);
  });

  it('returns {} for null / undefined / empty string', () => {
    expect(parseBreakdown(null)).toEqual({});
    expect(parseBreakdown(undefined)).toEqual({});
    expect(parseBreakdown('')).toEqual({});
  });

  it('returns {} for arrays (not objects)', () => {
    expect(parseBreakdown('[1,2,3]')).toEqual({});
  });

  it('returns {} for invalid JSON', () => {
    expect(parseBreakdown('{bad json')).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Channel Routing — dispatch decision logic
// ─────────────────────────────────────────────────────────────────────────────
describe('S10-5: Channel routing decisions', () => {
  function decideDispatch({ channels, botReady, smtpReady }) {
    if (!channels || channels.length === 0) return { block: true, reason: 'no-channels' };
    const waOnlyOffline = channels.includes('whatsapp') && !botReady && channels.length === 1;
    if (waOnlyOffline) return { block: true, reason: 'wa-offline' };
    const canWA    = channels.includes('whatsapp') && botReady;
    const canEmail = channels.includes('email');   // email can always queue
    return { block: false, canWA, canEmail, willQueue: canEmail && !smtpReady };
  }

  it('hard-blocks when WhatsApp is only channel and bot is offline', () => {
    const r = decideDispatch({ channels: ['whatsapp'], botReady: false, smtpReady: false });
    expect(r.block).toBe(true);
    expect(r.reason).toBe('wa-offline');
  });

  it('does NOT hard-block when email is also selected (email can queue)', () => {
    const r = decideDispatch({ channels: ['whatsapp', 'email'], botReady: false, smtpReady: false });
    expect(r.block).toBe(false);
    expect(r.canEmail).toBe(true);
  });

  it('hard-blocks when no channels selected', () => {
    const r = decideDispatch({ channels: [], botReady: true, smtpReady: true });
    expect(r.block).toBe(true);
    expect(r.reason).toBe('no-channels');
  });

  it('allows WA when bot is ready', () => {
    const r = decideDispatch({ channels: ['whatsapp'], botReady: true, smtpReady: false });
    expect(r.block).toBe(false);
    expect(r.canWA).toBe(true);
  });

  it('queues email when SMTP not configured (soft block)', () => {
    const r = decideDispatch({ channels: ['email'], botReady: false, smtpReady: false });
    expect(r.block).toBe(false);
    expect(r.willQueue).toBe(true);
  });

  it('sends email directly when SMTP is ready', () => {
    const r = decideDispatch({ channels: ['email'], botReady: false, smtpReady: true });
    expect(r.block).toBe(false);
    expect(r.willQueue).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Target ID Resolution
// ─────────────────────────────────────────────────────────────────────────────
describe('S10-6: Target student ID resolution', () => {
  function resolveTargetIds({ scope, studentIds, studentId, className }, mockDb) {
    if (Array.isArray(studentIds) && studentIds.length > 0) return studentIds;
    if (scope === 'student' && studentId) return [studentId];
    if (scope === 'class' && className) return mockDb.getByClass(className);
    return mockDb.getAllActive();
  }

  const mockDb = {
    getByClass:  (cn) => cn === 'JSS1Ruby' ? ['STU-001', 'STU-002'] : [],
    getAllActive: ()   => ['STU-001', 'STU-002', 'STU-003'],
  };

  it('prefers explicit studentIds array over scope', () => {
    const ids = resolveTargetIds({ scope: 'student', studentIds: ['STU-X'], studentId: 'STU-Y', className: null }, mockDb);
    expect(ids).toEqual(['STU-X']);
  });

  it('resolves single student from studentId when no array', () => {
    const ids = resolveTargetIds({ scope: 'student', studentIds: [], studentId: 'STU-0057', className: null }, mockDb);
    expect(ids).toEqual(['STU-0057']);
  });

  it('resolves class to its member IDs', () => {
    const ids = resolveTargetIds({ scope: 'class', studentIds: [], studentId: null, className: 'JSS1Ruby' }, mockDb);
    expect(ids).toEqual(['STU-001', 'STU-002']);
  });

  it('falls back to all active students when no scope info', () => {
    const ids = resolveTargetIds({ scope: 'all', studentIds: [], studentId: null, className: null }, mockDb);
    expect(ids).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. termConfig Contract
//    report-compiler.js buildContext reads these fields.
//    Any that are missing produce empty/broken template sections.
// ─────────────────────────────────────────────────────────────────────────────
describe('S10-7: termConfig required fields', () => {
  const REQUIRED_FIELDS = [
    'term',
    'academic_session',
    'grading_scale',
    'show_position',
    'show_domains',
    'include_attendance_in_grades',
    'attendance_score_weight',
    'exclude_unregistered_from_totals',
    'resumption_date',   // drives "Next Term Resumes: ..." footer
  ];

  /**
   * Simulate fetchTermConfig — merges DB row with caller overrides.
   * The key invariant: caller overrides always win for term / academic_session.
   */
  function fetchTermConfig(dbRow = {}, overrides = {}) {
    return { ...dbRow, ...overrides };
  }

  it('caller overrides win for term and academic_session', () => {
    const cfg = fetchTermConfig(
      { term: 'First Term', academic_session: '2024/2025', resumption_date: '2025-01-10' },
      { term: 'Third Term', academic_session: '2025/2026' }
    );
    expect(cfg.term).toBe('Third Term');
    expect(cfg.academic_session).toBe('2025/2026');
  });

  it('resumption_date from DB row is preserved when not overridden', () => {
    const cfg = fetchTermConfig(
      { resumption_date: '2026-09-07' },
      { term: 'Third Term', academic_session: '2025/2026' }
    );
    expect(cfg.resumption_date).toBe('2026-09-07');
  });

  it('all required template fields are present after merge', () => {
    const dbRow = {
      term: 'Third Term', academic_session: '2025/2026',
      grading_scale: '[]', show_position: 1, show_domains: 1,
      include_attendance_in_grades: 0, attendance_score_weight: 0,
      exclude_unregistered_from_totals: 0, resumption_date: '2026-09-07',
    };
    const cfg = fetchTermConfig(dbRow, {});
    REQUIRED_FIELDS.forEach(field => {
      expect(cfg).toHaveProperty(field);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. PDF Payload Contract — generate-reports ↔ dispatcher consistency
//    Both code paths call reports.generateHTMLPages(payload) with the same
//    payload shape. This test verifies the contract is met.
// ─────────────────────────────────────────────────────────────────────────────
describe('S10-8: PDF payload shape contract', () => {
  /** Minimum student shape that generateHTMLPages / buildContext expects */
  function buildMinimalStudentPayload({ attendance, formTeacherName }) {
    return {
      id:                     'STU-0057',
      name:                   'Abubakar Chukwuma',
      class_name:             'JSS 1 Ruby',
      subjects:               [],
      domains:                [],
      remark:                 '',
      principal_remark:       '',
      attendance,             // MUST be { total_days, days_attended }
      form_teacher_name:      formTeacherName,
      form_teacher_signature: null,
      feeStatus:              'cleared',
    };
  }

  it('attendance field is an object with the right keys', () => {
    const stu = buildMinimalStudentPayload({
      attendance: { total_days: 60, days_attended: 55 },
      formTeacherName: 'Yinka Dada',
    });
    expect(stu.attendance).toHaveProperty('total_days');
    expect(stu.attendance).toHaveProperty('days_attended');
  });

  it('form_teacher_name is a string (not null/undefined) when teacher exists', () => {
    const stu = buildMinimalStudentPayload({
      attendance: { total_days: 60, days_attended: 55 },
      formTeacherName: 'Yinka Dada',
    });
    expect(stu.form_teacher_name).toBe('Yinka Dada');
    expect(typeof stu.form_teacher_name).toBe('string');
  });

  it('form_teacher_name defaults to empty string when no teacher assigned', () => {
    const stu = buildMinimalStudentPayload({
      attendance: { total_days: 0, days_attended: 0 },
      formTeacherName: '',
    });
    expect(stu.form_teacher_name).toBe('');
  });

  it('generateHTMLPages payload has identity, students, termConfig, templateId', () => {
    const payload = {
      identity:   { name: 'Test School', tier: 'Standalone' },
      students:   [buildMinimalStudentPayload({ attendance: { total_days: 0, days_attended: 0 }, formTeacherName: '' })],
      termConfig: { term: 'Third Term', academic_session: '2025/2026', grading_scale: '[]' },
      templateId: 'clean_slate',
      reportType: 'terminal',
      format:     'pdf',
    };
    expect(payload).toHaveProperty('identity');
    expect(payload).toHaveProperty('students');
    expect(payload).toHaveProperty('termConfig');
    expect(payload).toHaveProperty('templateId');
    expect(payload.students[0].attendance).toHaveProperty('days_attended');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. compileBatchAndUpload — parentMap construction
//    Mirrors the logic in compileBatchAndUpload (result-dispatcher.js)
// ─────────────────────────────────────────────────────────────────────────────
describe('S10-9: compileBatchAndUpload parentMap', () => {
  function buildParentMap(students) {
    const map = {};
    for (const s of students) {
      const phone = s.parent_phone;
      if (!phone) continue;
      if (!map[phone]) map[phone] = [];
      if (!map[phone].includes(s.id)) map[phone].push(s.id);
    }
    return map;
  }

  it('groups siblings under one parent phone', () => {
    const students = [
      { id: 'STU-001', parent_phone: '2348012345678' },
      { id: 'STU-002', parent_phone: '2348012345678' },
      { id: 'STU-003', parent_phone: '2348099887766' },
    ];
    const map = buildParentMap(students);
    expect(map['2348012345678']).toHaveLength(2);
    expect(map['2348099887766']).toHaveLength(1);
  });

  it('does not duplicate a student ID under the same phone', () => {
    const students = [
      { id: 'STU-001', parent_phone: '2348012345678' },
      { id: 'STU-001', parent_phone: '2348012345678' }, // duplicate
    ];
    const map = buildParentMap(students);
    expect(map['2348012345678']).toHaveLength(1);
  });

  it('skips students with no parent phone', () => {
    const students = [
      { id: 'STU-001', parent_phone: '' },
      { id: 'STU-002', parent_phone: null },
      { id: 'STU-003', parent_phone: '2348099887766' },
    ];
    const map = buildParentMap(students);
    expect(Object.keys(map)).toHaveLength(1);
    expect(map['2348099887766']).toEqual(['STU-003']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Dispatch counter mutual exclusivity
//     dispatched / skipped / queued must be incremented on distinct branches.
// ─────────────────────────────────────────────────────────────────────────────
describe('S10-10: Dispatch counter logic', () => {
  function simulateDispatch(students, { botReady, smtpReady, channels }) {
    let dispatched = 0, skipped = 0, queued = 0;

    for (const stu of students) {
      const hasPhone = !!stu.parent_phone;
      const hasEmail = !!stu.parent_email;

      if (!hasPhone && !hasEmail) { skipped++; continue; }

      if (channels.includes('whatsapp') && botReady) {
        if (hasPhone) dispatched++;
        else          skipped++;
      }

      if (channels.includes('email') && hasEmail) {
        if (smtpReady) dispatched++;
        else           queued++;
      }
    }

    return { dispatched, skipped, queued };
  }

  it('students with no contact are always skipped', () => {
    const r = simulateDispatch(
      [{ parent_phone: '', parent_email: '' }],
      { botReady: true, smtpReady: true, channels: ['whatsapp', 'email'] }
    );
    expect(r.skipped).toBe(1);
    expect(r.dispatched).toBe(0);
  });

  it('dispatched increments once per successful channel per student', () => {
    const r = simulateDispatch(
      [{ parent_phone: '234...', parent_email: 'a@b.com' }],
      { botReady: true, smtpReady: true, channels: ['whatsapp', 'email'] }
    );
    expect(r.dispatched).toBe(2); // once for WA, once for email
    expect(r.skipped).toBe(0);
    expect(r.queued).toBe(0);
  });

  it('email queues when SMTP not ready', () => {
    const r = simulateDispatch(
      [{ parent_phone: '', parent_email: 'a@b.com' }],
      { botReady: false, smtpReady: false, channels: ['email'] }
    );
    expect(r.queued).toBe(1);
    expect(r.dispatched).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Zero-Grade Filter Contract & Empty Sheet Prevention
// ─────────────────────────────────────────────────────────────────────────────
describe('S10-11: Zero-grade filtering & empty sheet prevention contract', () => {
  function applyZeroGradeFilter(students, skipFilterEnabled) {
    if (!skipFilterEnabled) return students;
    return students.filter(s => (s.average ?? 0) > 0);
  }

  function groupStudentsByClass(students) {
    const groups = {};
    for (const s of students) {
      const cn = (s.class_name || 'Unassigned').trim();
      if (!groups[cn]) groups[cn] = [];
      groups[cn].push(s);
    }
    return groups;
  }

  it('filters out students with 0 or null average when skipFilter is active', () => {
    const queryResults = [
      { id: 'STU-1', name: 'Alice', average: 75.5 },
      { id: 'STU-2', name: 'Bob', average: 0 },
      { id: 'STU-3', name: 'Charlie', average: null },
      { id: 'STU-4', name: 'David', average: 88.0 }
    ];

    const filtered = applyZeroGradeFilter(queryResults, true);
    expect(filtered.length).toBe(2);
    expect(filtered.map(s => s.id)).toEqual(['STU-1', 'STU-4']);
  });

  it('returns all students when skipFilter is disabled', () => {
    const queryResults = [
      { id: 'STU-1', name: 'Alice', average: 75.5 },
      { id: 'STU-2', name: 'Bob', average: 0 }
    ];

    const filtered = applyZeroGradeFilter(queryResults, false);
    expect(filtered.length).toBe(2);
  });

  it('skips empty class groups after zero-grade filtering to prevent empty sheets', () => {
    const queryResults = [
      { id: 'STU-1', name: 'Alice', class_name: 'JSS 1', average: 75.5 },
      { id: 'STU-2', name: 'Bob', class_name: 'JSS 2', average: 0 } // JSS 2 student has 0 average
    ];

    const filtered = applyZeroGradeFilter(queryResults, true);
    const groups = groupStudentsByClass(filtered);

    // JSS 1 has 1 student, JSS 2 has 0 students in filtered list
    expect(groups['JSS 1']?.length).toBe(1);
    expect(groups['JSS 2']).toBeUndefined();

    // Verify empty group skipping logic
    const renderedClasses = Object.keys(groups).filter(cn => (groups[cn] || []).length > 0);
    expect(renderedClasses).toEqual(['JSS 1']);
  });
});
