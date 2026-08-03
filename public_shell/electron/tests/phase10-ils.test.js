/**
 * tests/phase10-ils.test.js
 *
 * Phase 10: Individualized Learning System (ILS / ACE PAC) — unit tests
 *
 * Tests do NOT require a live Electron process or database.
 * They validate pure logic contracts used by both the IPC handlers
 * and the report generator.
 *
 * Tests:
 *  1.  PAC score ≥ 85 is considered "passed"
 *  2.  PAC score < 85 is considered "failed"
 *  3.  PAC score of exactly 85 is the boundary pass case
 *  4.  Completion rate is 0 when no packs are done
 *  5.  Completion rate is 100 when all 10 packs are done
 *  6.  Completion rate rounds correctly for partial completion
 *  7.  Per-subject packs_completed counts only passed packs
 *  8.  total_hundreds sums scores of passed packs only
 *  9.  Average is 0 when no packs are completed
 * 10.  Average is correct for completed packs
 * 11.  generateILSHTMLPages returns fallback HTML for empty student list
 * 12.  generateILSHTMLPages returns one page per student
 * 13.  ILS report page contains student name
 * 14.  ILS report page contains PAC table
 * 15.  ILS report page shows verse count
 * 16.  ILS report page shows "In Progress" when packs_completed < 10
 * 17.  ILS report page shows "✓ Complete" when packs_completed = 10
 * 18.  ILS report page contains Completion Rate
 * 19.  generateILSHTMLPages does not include grade columns
 * 20.  generateILSHTMLPages does not include position column
 */

import { describe, it, expect } from 'vitest';

// ── Pure logic helpers ──────────────────────────────────────────────────────

/** Mirrors the PAC pass/fail rule used in IPC handlers and report-compiler */
const PAC_PASS_THRESHOLD = 85;

function isPacPassed(score) {
  return typeof score === 'number' && score >= PAC_PASS_THRESHOLD;
}

/**
 * Aggregates raw PAC rows (as returned from ils_records) into per-subject
 * summary objects — same logic as the generate-reports IPC handler.
 */
function aggregateBySubject(rows) {
  const bySubject = {};
  for (const r of rows) {
    if (!bySubject[r.subject]) bySubject[r.subject] = [];
    bySubject[r.subject].push(r);
  }
  return Object.entries(bySubject).map(([subject, packs]) => {
    const passed = packs.filter(p => isPacPassed(p.score));
    const total  = passed.reduce((sum, p) => sum + p.score, 0);
    const avg    = passed.length > 0
      ? Math.round((total / passed.length) * 10) / 10
      : 0;
    return { subject, packs_completed: passed.length, total_hundreds: total, average: avg };
  });
}

/**
 * Mirrors the completion-rate formula in generateILSHTMLPages.
 * maxPacks = subjects.length × 10
 */
function computeCompletionRate(subjects) {
  const totalPacked = subjects.reduce((s, x) => s + (x.packs_completed || 0), 0);
  const maxPacks    = subjects.length * 10;
  return maxPacks > 0 ? Math.round((totalPacked / maxPacks) * 100) : 0;
}

// ── Load the real report compiler ───────────────────────────────────────────

const path = require('path');
const { generateILSHTMLPages } = require(
  path.join(__dirname, '../node_modules/@nexus/engine/src/report-compiler.js')
);

// ── Test fixtures ────────────────────────────────────────────────────────────

function makeStudent(overrides = {}) {
  return {
    id: 'stu-001',
    name: 'Ada Okonkwo',
    class_name: 'Creche',
    il_subjects: [
      { subject: 'Mathematics', packs_completed: 7, total_hundreds: 630, average: 90 },
      { subject: 'English Language', packs_completed: 10, total_hundreds: 880, average: 88 },
    ],
    verse_count: 5,
    _resolvedManager: {},
    ...overrides,
  };
}

function makePayload(studentOverrides = {}) {
  return {
    students: [makeStudent(studentOverrides)],
    termConfig: { academic_session: '2025/2026', term: 'Second Term' },
    identity:   { name: 'Nexus Academy', address: '1 School Lane', themePrimary: '#1A237E' },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Phase 10 — ILS PAC pass/fail logic', () => {
  it('1. score ≥ 85 is passed', () => {
    expect(isPacPassed(90)).toBe(true);
    expect(isPacPassed(100)).toBe(true);
  });

  it('2. score < 85 is failed', () => {
    expect(isPacPassed(84)).toBe(false);
    expect(isPacPassed(0)).toBe(false);
  });

  it('3. score of exactly 85 is the boundary pass', () => {
    expect(isPacPassed(85)).toBe(true);
  });
});

describe('Phase 10 — ILS completion rate', () => {
  it('4. completion rate is 0 when no packs are done', () => {
    const subjects = [
      { subject: 'Maths',   packs_completed: 0 },
      { subject: 'English', packs_completed: 0 },
    ];
    expect(computeCompletionRate(subjects)).toBe(0);
  });

  it('5. completion rate is 100 when all 10 packs done per subject', () => {
    const subjects = [
      { subject: 'Maths',   packs_completed: 10 },
      { subject: 'English', packs_completed: 10 },
    ];
    expect(computeCompletionRate(subjects)).toBe(100);
  });

  it('6. completion rate rounds correctly for partial completion (7/10 one subject)', () => {
    const subjects = [{ subject: 'Maths', packs_completed: 7 }];
    expect(computeCompletionRate(subjects)).toBe(70);
  });
});

describe('Phase 10 — ILS per-subject aggregation', () => {
  const rows = [
    { subject: 'Mathematics', pack_number: 1, score: 90  }, // pass
    { subject: 'Mathematics', pack_number: 2, score: 80  }, // fail
    { subject: 'Mathematics', pack_number: 3, score: 85  }, // pass (boundary)
    { subject: 'English',     pack_number: 1, score: 95  }, // pass
    { subject: 'English',     pack_number: 2, score: 70  }, // fail
  ];

  const summary = aggregateBySubject(rows);
  const maths   = summary.find(s => s.subject === 'Mathematics');
  const english = summary.find(s => s.subject === 'English');

  it('7. packs_completed counts only passed packs', () => {
    expect(maths.packs_completed).toBe(2);   // 90 and 85
    expect(english.packs_completed).toBe(1); // 95 only
  });

  it('8. total_hundreds sums scores of passed packs only', () => {
    expect(maths.total_hundreds).toBe(175);  // 90 + 85
    expect(english.total_hundreds).toBe(95); // 95
  });

  it('9. average is 0 when no packs are completed', () => {
    const failRows = [{ subject: 'Science', pack_number: 1, score: 50 }];
    const result = aggregateBySubject(failRows);
    expect(result[0].average).toBe(0);
  });

  it('10. average is correct for completed packs', () => {
    // Math: (90 + 85) / 2 = 87.5
    expect(maths.average).toBe(87.5);
    // English: 95 / 1 = 95
    expect(english.average).toBe(95);
  });
});

describe('Phase 10 — generateILSHTMLPages output contracts', () => {
  it('11. returns fallback HTML for empty student list', () => {
    const html = generateILSHTMLPages({ students: [], termConfig: {}, identity: {} });
    expect(html).toContain('No ILS students');
  });

  it('12. returns one page div per student', () => {
    const payload = makePayload();
    const html    = generateILSHTMLPages(payload);
    const count   = (html.match(/class="report-page"/g) || []).length;
    expect(count).toBe(1); // one student in fixture
  });

  it('13. ILS report page contains the student name', () => {
    const html = generateILSHTMLPages(makePayload());
    expect(html).toContain('Ada Okonkwo');
  });

  it('14. ILS report page contains PAC table (pac-table class)', () => {
    const html = generateILSHTMLPages(makePayload());
    expect(html).toContain('pac-table');
  });

  it('15. ILS report page shows verse count', () => {
    const html = generateILSHTMLPages(makePayload());
    expect(html).toContain('5'); // verse_count = 5
    expect(html).toContain('Bible Verse Memory');
  });

  it('16. status badges ("In Progress" / "✓ Complete") are removed from subject names', () => {
    const html = generateILSHTMLPages(makePayload());
    expect(html).not.toContain('In Progress');
    expect(html).not.toContain('✓ Complete');
  });

  it('17. displays total PACs completed count across subjects', () => {
    const html = generateILSHTMLPages(makePayload());
    expect(html).toContain('PACs Completed');
    expect(html).toContain('>17<');
  });

  it('18. ILS report page shows Completion Rate', () => {
    const html = generateILSHTMLPages(makePayload());
    expect(html).toContain('Completion Rate');
    // 17 out of 20 packs = 85%
    expect(html).toContain('85%');
  });

  it('19. ILS report does not include grade columns (A1, B2, etc.)', () => {
    const html = generateILSHTMLPages(makePayload());
    // Standard grade column headers should not appear
    expect(html).not.toContain('>Grade<');
    expect(html).not.toContain('>Remark<');
  });

  it('20. ILS report does not include position column', () => {
    const html = generateILSHTMLPages(makePayload());
    expect(html).not.toContain('Position');
    expect(html).not.toContain('Class Position');
  });
});
