/**
 * tests/phase10-ils-extended.test.js
 *
 * Extended ILS safeguard tests covering all new functionality added after
 * phase10-ils.test.js and phase10-ils-validation.test.js:
 *
 *  A. Dynamic PAC column labels (buildPacHeaders)
 *  B. Variable PAC count in aggregation (computeILSAggregates)
 *  C. resolveManager prefix matching
 *  D. ILS HTML output — remarks & signature context
 *  E. ILS student filter logic (mirrors getFilteredStudents in ResultStudio)
 *  F. Auto-fill remarks — ILS vs Standard branches
 */

import { describe, it, expect } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// A. Dynamic PAC column labels — pure logic extracted from buildPacHeaders
// ─────────────────────────────────────────────────────────────────────────────

function buildPacHeaderLabels(pacCount, pacLabels) {
  return Array.from({ length: pacCount }, (_, i) => {
    const lbl = (Array.isArray(pacLabels) && pacLabels[i] && String(pacLabels[i]).trim())
      ? String(pacLabels[i]).trim()
      : `P${i + 1}`;
    return lbl;
  });
}

describe('A. Dynamic PAC column labels', () => {
  it('A1. uses custom label when pac_labels entry is set', () => {
    const labels = buildPacHeaderLabels(3, ['Alpha', 'Beta', 'Gamma']);
    expect(labels).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('A2. falls back to P{n} when pac_labels is null', () => {
    const labels = buildPacHeaderLabels(3, null);
    expect(labels).toEqual(['P1', 'P2', 'P3']);
  });

  it('A2b. falls back to P{n} when pac_labels entries are blank strings', () => {
    const labels = buildPacHeaderLabels(3, ['', '', '']);
    expect(labels).toEqual(['P1', 'P2', 'P3']);
  });

  it('A3. handles partial pac_labels array — custom for some, default for rest', () => {
    const labels = buildPacHeaderLabels(4, ['Week 1', 'Week 2']);
    expect(labels).toEqual(['Week 1', 'Week 2', 'P3', 'P4']);
  });

  it('A4a. works with pac_count = 5', () => {
    const labels = buildPacHeaderLabels(5, null);
    expect(labels).toHaveLength(5);
    expect(labels[4]).toBe('P5');
  });

  it('A4b. works with pac_count = 25', () => {
    const labels = buildPacHeaderLabels(25, null);
    expect(labels).toHaveLength(25);
    expect(labels[24]).toBe('P25');
  });

  it('A4c. full custom labels with pac_count = 25', () => {
    const customLabels = Array.from({ length: 25 }, (_, i) => `Unit ${i + 1}`);
    const labels = buildPacHeaderLabels(25, customLabels);
    expect(labels[0]).toBe('Unit 1');
    expect(labels[24]).toBe('Unit 25');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Variable PAC count in ILS aggregation
// ─────────────────────────────────────────────────────────────────────────────

function computeILSAggregates(student) {
  const pacCount      = student.pac_count || 12;
  const ilSubs        = Array.isArray(student.il_subjects) ? student.il_subjects : [];
  let totalScore      = 0;
  let totalGraded     = 0;
  let totalHundreds   = 0;
  const totalPossible = ilSubs.length * pacCount;

  const enrichedSubjects = ilSubs.map(sub => {
    const packsMap  = (typeof sub.packs === 'object' && sub.packs) ? sub.packs : {};
    let subTotal    = 0;
    let subHundreds = 0;
    let subGraded   = 0;

    const pacColumns = Array.from({ length: pacCount }, (_, i) => {
      const packNum  = i + 1;
      const score    = packsMap[packNum];
      const hasScore = score !== undefined && score !== null;
      if (hasScore) {
        subTotal  += Number(score);
        subGraded += 1;
        if (Number(score) === 100) subHundreds++;
      }
      return { packNum, score: hasScore ? score : null, isEmpty: !hasScore };
    });

    totalScore    += subTotal;
    totalGraded   += subGraded;
    totalHundreds += subHundreds;

    const subAvg = subGraded > 0 ? Math.round((subTotal / subGraded) * 10) / 10 : null;
    return { name: sub.subject, pacColumns, subTotal: subGraded > 0 ? subTotal : null, subAvg, hundreds: subHundreds, pacCount };
  });

  const overallAvg = totalGraded > 0
    ? Math.round((totalScore / totalGraded) * 10) / 10
    : null;
  const completionRate = totalPossible > 0
    ? Math.round((totalGraded / totalPossible) * 100)
    : 0;

  return {
    enrichedSubjects, pacCount,
    totalScore: totalGraded > 0 ? totalScore : 0,
    overallAvg: overallAvg !== null ? overallAvg : '—',
    totalHundreds, totalGraded, totalPossible, completionRate,
  };
}

describe('B. Variable PAC count in aggregation', () => {
  it('B1. pac_count drives number of PAC columns per subject', () => {
    const student = {
      pac_count: 5,
      il_subjects: [{ subject: 'Maths', packs: { 1: 90, 2: 88, 3: 92 } }],
    };
    const agg = computeILSAggregates(student);
    expect(agg.enrichedSubjects[0].pacColumns).toHaveLength(5);
  });

  it('B2. scores in packs beyond pac_count are ignored', () => {
    const student = {
      pac_count: 3,
      il_subjects: [{ subject: 'Maths', packs: { 1: 90, 2: 88, 3: 92, 4: 100 } }],
    };
    const agg = computeILSAggregates(student);
    expect(agg.totalGraded).toBe(3);
    expect(agg.totalHundreds).toBe(0); // pack 4 (100) excluded
  });

  it('B3. totalPossible = subjects × pac_count', () => {
    const student = {
      pac_count: 5,
      il_subjects: [
        { subject: 'Maths', packs: {} },
        { subject: 'English', packs: {} },
        { subject: 'Science', packs: {} },
      ],
    };
    const agg = computeILSAggregates(student);
    expect(agg.totalPossible).toBe(15);
  });

  it('B4. completionRate respects pac_count denominator', () => {
    const student = {
      pac_count: 5,
      il_subjects: [{ subject: 'Maths', packs: { 1: 90, 2: 88 } }],
    };
    const agg = computeILSAggregates(student);
    expect(agg.completionRate).toBe(40);
  });

  it('B5. overallAvg is "—" when no packs graded', () => {
    const student = {
      pac_count: 12,
      il_subjects: [{ subject: 'Maths', packs: {} }],
    };
    const agg = computeILSAggregates(student);
    expect(agg.overallAvg).toBe('—');
  });

  it('B6. totalHundreds counts exact 100 scores only', () => {
    const student = {
      pac_count: 4,
      il_subjects: [{ subject: 'Maths', packs: { 1: 100, 2: 99, 3: 100, 4: 88 } }],
    };
    const agg = computeILSAggregates(student);
    expect(agg.totalHundreds).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. resolveManager prefix matching
// ─────────────────────────────────────────────────────────────────────────────

function resolveManager(className, managers, fallback) {
  if (!className || !Array.isArray(managers) || managers.length === 0) return fallback;
  const normClass = className.replace(/\s+/g, '').toUpperCase();
  for (const mgr of managers) {
    for (const prefix of (mgr._parsedPrefixes || [])) {
      if (prefix && normClass.startsWith(prefix)) return mgr;
    }
  }
  return fallback;
}

const PRINCIPAL = { id: 'principal', manager_title: 'Principal', manager_name: 'Dr. Adeyemi' };
const PRI_MGR   = { id: 'pri-mgr',  manager_title: 'Primary Manager',   _parsedPrefixes: ['PRIMARY', 'PRI'] };
const SEC_MGR   = { id: 'sec-mgr',  manager_title: 'Secondary Manager', _parsedPrefixes: ['SECONDARY', 'SEC'] };
const CRE_MGR   = { id: 'cre-mgr',  manager_title: 'Creche Manager',    _parsedPrefixes: ['CRECHE', 'CRE'] };
const ALL_MGR   = [PRI_MGR, SEC_MGR, CRE_MGR];

describe('C. resolveManager prefix matching', () => {
  it('C1. matches "Primary 1" to PRIMARY manager', () => {
    expect(resolveManager('Primary 1', ALL_MGR, PRINCIPAL).id).toBe('pri-mgr');
  });

  it('C2. matches "Secondary 3A" to SECONDARY manager', () => {
    expect(resolveManager('Secondary 3A', ALL_MGR, PRINCIPAL).id).toBe('sec-mgr');
  });

  it('C3. falls back to principal when no prefix matches', () => {
    expect(resolveManager('Nursery 2', ALL_MGR, PRINCIPAL).id).toBe('principal');
  });

  it('C4. falls back when managers array is empty', () => {
    expect(resolveManager('Primary 1', [], PRINCIPAL).id).toBe('principal');
  });

  it('C5. falls back when className is null', () => {
    expect(resolveManager(null, ALL_MGR, PRINCIPAL).id).toBe('principal');
  });

  it('C5b. falls back when className is undefined', () => {
    expect(resolveManager(undefined, ALL_MGR, PRINCIPAL).id).toBe('principal');
  });

  it('C6. match is whitespace-insensitive and case-insensitive', () => {
    expect(resolveManager('primary   1', ALL_MGR, PRINCIPAL).id).toBe('pri-mgr');
    expect(resolveManager('PRIMARY1',    ALL_MGR, PRINCIPAL).id).toBe('pri-mgr');
  });

  it('C7. "Creche A" resolves to Creche manager, not Primary', () => {
    expect(resolveManager('Creche A', ALL_MGR, PRINCIPAL).id).toBe('cre-mgr');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. ILS HTML output — remarks & signature context (via real generateILSHTMLPages)
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const { generateILSHTMLPages, saveBase64Image } = require(
  path.join(__dirname, '../node_modules/@nexus/engine/src/report-compiler.js')
);

function makeILSPayload(overrides = {}, payloadOverrides = {}) {
  return {
    students: [{
      id: 'stu-d01',
      name: 'Chukwuemeka Nwosu',
      class_name: 'Primary 3',
      pac_count: 12,
      il_subjects: [
        { subject: 'Mathematics', packs: { 1: 90, 2: 88, 3: 92, 4: 87, 5: 91 } },
      ],
      verse_count: 8,
      remark:           'An excellent student who shows great dedication.',
      principal_remark: 'Outstanding commitment to the ILS programme.',
      managerTitle: 'Primary Manager',
      managerName:  'Mrs. Eze',
      managerSignUrl: null,
      ...overrides,
    }],
    termConfig: { academic_session: '2025/2026', term: 'First Term' },
    identity:   { name: 'Nexus Academy', address: '1 School Lane' },
    ...payloadOverrides,
  };
}

describe('D. ILS HTML output — remarks & signature context', () => {
  it('D1. student.remark appears in rendered HTML', () => {
    const html = generateILSHTMLPages(makeILSPayload());
    expect(html).toContain('An excellent student who shows great dedication.');
  });

  it('D2. student.principal_remark appears in rendered HTML', () => {
    const html = generateILSHTMLPages(makeILSPayload());
    expect(html).toContain('Outstanding commitment to the ILS programme.');
  });

  it('D3. falls back gracefully when remarks are empty strings', () => {
    const html = generateILSHTMLPages(makeILSPayload({ remark: '', principal_remark: '' }));
    expect(html).toContain('Chukwuemeka Nwosu'); // page still renders
  });

  it('D4. custom pac_labels appear in PAC table headers', () => {
    const html = generateILSHTMLPages(makeILSPayload({}, { pac_labels: ['Week 1', 'Week 2', 'Week 3'] }));
    expect(html).toContain('Week 1');
    expect(html).toContain('Week 2');
  });

  it('D5. without pac_labels, default P1/P2 headers are rendered', () => {
    const html = generateILSHTMLPages(makeILSPayload());
    expect(html).toContain('P1');
    expect(html).toContain('P2');
  });

  it('D6. student name appears in the output', () => {
    const html = generateILSHTMLPages(makeILSPayload());
    expect(html).toContain('Chukwuemeka Nwosu');
  });

  it('D7. empty student list returns fallback HTML, not a crash', () => {
    const html = generateILSHTMLPages({ students: [], termConfig: {}, identity: {} });
    expect(html).toContain('No ILS students');
  });

  it('D8. multiple students produce one page each', () => {
    const payload = makeILSPayload();
    payload.students.push({ ...payload.students[0], id: 'stu-d02', name: 'Ngozi Eze' });
    const html = generateILSHTMLPages(payload);
    expect(html).toContain('Chukwuemeka Nwosu');
    expect(html).toContain('Ngozi Eze');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. ILS student filter logic
// ─────────────────────────────────────────────────────────────────────────────

function getFilteredILSStudents(students, { ilsSkipZeroPacs = false, ilsSkipP1Unstarted = false } = {}) {
  return students.filter(s => {
    const ilSubs = s.il_subjects || [];
    if (ilsSkipZeroPacs) {
      const totalGraded = ilSubs.reduce((acc, sub) => acc + (sub.packs_completed || 0), 0);
      if (totalGraded === 0) return false;
    }
    if (ilsSkipP1Unstarted) {
      const hasAnyP1 = ilSubs.some(sub => {
        const packs = sub.packs || {};
        return packs[1] !== undefined && packs[1] !== null;
      });
      if (!hasAnyP1) return false;
    }
    return true;
  });
}

const FILTER_STUDENTS = [
  { id: 'e1', name: 'Amaka',    il_subjects: [{ subject: 'Maths', packs_completed: 0, packs: {} }] },
  { id: 'e2', name: 'Bello',    il_subjects: [{ subject: 'Maths', packs_completed: 3, packs: { 1: 90, 2: 88, 3: 92 } }] },
  { id: 'e3', name: 'Chidi',    il_subjects: [{ subject: 'Maths', packs_completed: 2, packs: { 2: 88, 3: 92 } }] }, // no P1
  { id: 'e4', name: 'Damilola', il_subjects: [] },
];

describe('E. ILS student filter logic', () => {
  it('E1. ilsSkipZeroPacs removes students with 0 graded PACs', () => {
    const ids = getFilteredILSStudents(FILTER_STUDENTS, { ilsSkipZeroPacs: true }).map(s => s.id);
    expect(ids).not.toContain('e1');
    expect(ids).not.toContain('e4');
  });

  it('E2. ilsSkipZeroPacs keeps students with ≥1 graded PAC', () => {
    const ids = getFilteredILSStudents(FILTER_STUDENTS, { ilsSkipZeroPacs: true }).map(s => s.id);
    expect(ids).toContain('e2');
    expect(ids).toContain('e3');
  });

  it('E3. ilsSkipP1Unstarted removes students with no Pack 1 scored', () => {
    const ids = getFilteredILSStudents(FILTER_STUDENTS, { ilsSkipP1Unstarted: true }).map(s => s.id);
    expect(ids).not.toContain('e3'); // packs 2 and 3 only
    expect(ids).not.toContain('e4'); // no subjects
  });

  it('E4. ilsSkipP1Unstarted keeps students where at least one subject has P1', () => {
    const ids = getFilteredILSStudents(FILTER_STUDENTS, { ilsSkipP1Unstarted: true }).map(s => s.id);
    expect(ids).toContain('e2');
  });

  it('E5. both filters applied — only students satisfying both pass through', () => {
    const ids = getFilteredILSStudents(FILTER_STUDENTS, {
      ilsSkipZeroPacs: true,
      ilsSkipP1Unstarted: true,
    }).map(s => s.id);
    expect(ids).toEqual(['e2']);
  });

  it('E6. with no filters, all students are included', () => {
    const result = getFilteredILSStudents(FILTER_STUDENTS, {});
    expect(result).toHaveLength(FILTER_STUDENTS.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Auto-fill remarks — ILS vs Standard branches
// ─────────────────────────────────────────────────────────────────────────────

function autoFillRemark(student, { isILS = false, isEndTerm = false } = {}) {
  let remark = student.remark;
  let princ  = student.principal_remark;
  const avgRaw    = parseFloat(student.average);
  const hasILSData = isILS && Array.isArray(student.il_subjects);
  const hasGrades  = hasILSData || !isNaN(avgRaw);
  const avg        = !isNaN(avgRaw) ? avgRaw : 0;

  if (!remark) {
    if (!hasGrades) {
      remark = 'No academic records for this term.';
    } else if (isILS) {
      if (avg >= 85)      remark = 'An excellent PAC performance. Keep excelling!';
      else if (avg >= 70) remark = 'A commendable PAC record. Keep pushing higher.';
      else                remark = 'More diligence is required in PAC completion. Work harder.';
    } else {
      remark = 'An impressive performance. Keep it up.';
      if (avg < 50)       remark = 'Work harder next term to improve your grades.';
      else if (avg < 70)  remark = 'A good result, but there is room for more effort.';
    }
  }

  if (!princ) {
    if (!hasGrades) {
      princ = 'No academic records.';
    } else if (isILS) {
      if (avg >= 85)       princ = 'Outstanding dedication to the ILS curriculum. Well done!';
      else if (avg >= 70)  princ = 'A satisfactory ILS term. Continue to strive for mastery.';
      else if (isEndTerm)  princ = 'Greater commitment to the PAC programme is required next session.';
      else                 princ = 'Consistent effort in PAC studies will yield better results.';
    } else if (isEndTerm) {
      princ = 'Promoted to next class.';
      if (avg < 40) princ = 'To repeat the class.';
    } else {
      princ = 'An encouraging performance this term. Keep it up.';
      if (avg < 40)       princ = 'A poor result. Strive to perform better next term.';
      else if (avg < 70)  princ = 'A satisfactory term result. Strive for higher grades.';
    }
  }

  return { remark, principal_remark: princ };
}

describe('F. Auto-fill remarks — ILS branch', () => {
  const baseILS = { remark: '', principal_remark: '', il_subjects: [{}] };

  it('F1. ILS avg >= 85 → excellent teacher remark', () => {
    const r = autoFillRemark({ ...baseILS, average: '90' }, { isILS: true });
    expect(r.remark).toContain('excellent PAC performance');
  });

  it('F2. ILS avg 70-84 → commendable teacher remark', () => {
    const r = autoFillRemark({ ...baseILS, average: '75' }, { isILS: true });
    expect(r.remark).toContain('commendable PAC record');
  });

  it('F3. ILS avg < 70 → diligence teacher remark', () => {
    const r = autoFillRemark({ ...baseILS, average: '60' }, { isILS: true });
    expect(r.remark).toContain('diligence');
  });

  it('F4. ILS avg >= 85 → outstanding manager remark', () => {
    const r = autoFillRemark({ ...baseILS, average: '92' }, { isILS: true });
    expect(r.principal_remark).toContain('Outstanding dedication');
  });

  it('F5. ILS avg 70-84 → satisfactory manager remark', () => {
    const r = autoFillRemark({ ...baseILS, average: '73' }, { isILS: true });
    expect(r.principal_remark).toContain('satisfactory ILS term');
  });

  it('F6. ILS avg < 70 mid-term → consistent-effort manager remark', () => {
    const r = autoFillRemark({ ...baseILS, average: '65' }, { isILS: true, isEndTerm: false });
    expect(r.principal_remark).toContain('Consistent effort');
  });

  it('F7. ILS avg < 70 end-term → greater-commitment manager remark', () => {
    const r = autoFillRemark({ ...baseILS, average: '65' }, { isILS: true, isEndTerm: true });
    expect(r.principal_remark).toContain('Greater commitment');
  });

  it('F8. existing remark is NOT overwritten', () => {
    const r = autoFillRemark({ ...baseILS, remark: 'Already written.', average: '90' }, { isILS: true });
    expect(r.remark).toBe('Already written.');
    expect(r.principal_remark).toContain('Outstanding dedication');
  });

  it('F8b. existing principal_remark is NOT overwritten', () => {
    const r = autoFillRemark({ ...baseILS, principal_remark: 'Custom mgr note.', average: '90' }, { isILS: true });
    expect(r.principal_remark).toBe('Custom mgr note.');
  });

  it('F9. Standard avg < 50 → "Work harder" teacher remark', () => {
    const r = autoFillRemark({ remark: '', principal_remark: '', average: '45' }, { isILS: false });
    expect(r.remark).toContain('Work harder');
  });

  it('F10. Standard end-term avg < 40 → "To repeat the class" manager remark', () => {
    const r = autoFillRemark({ remark: '', principal_remark: '', average: '35' }, { isILS: false, isEndTerm: true });
    expect(r.principal_remark).toBe('To repeat the class.');
  });

  it('F10b. Standard end-term avg >= 40 → "Promoted" manager remark', () => {
    const r = autoFillRemark({ remark: '', principal_remark: '', average: '55' }, { isILS: false, isEndTerm: true });
    expect(r.principal_remark).toBe('Promoted to next class.');
  });

  it('F11. no grades and no il_subjects → "No academic records"', () => {
    const r = autoFillRemark({ remark: '', principal_remark: '', average: 'NaN' }, { isILS: false });
    expect(r.remark).toContain('No academic records');
    expect(r.principal_remark).toContain('No academic records');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. Dispatch & Publish Stamp Resolution & Extension Safeguards
// ─────────────────────────────────────────────────────────────────────────────

describe('G. Dispatch & Publish Stamp Resolution & Extension Safeguards', () => {
  it('G1. saveBase64Image normalizes svg+xml extension to .svg', () => {
    const svgData = 'data:image/svg+xml;base64,' + Buffer.from('<svg></svg>').toString('base64');
    const tempDir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'test_stamp_'));
    const url = saveBase64Image(svgData, 'stamp_test', tempDir);
    expect(url).toMatch(/\.svg$/);
    expect(url).not.toMatch(/\.svg\+xml$/);
    require('fs').rmSync(tempDir, { recursive: true, force: true });
  });

  it('G2. saveBase64Image normalizes jpeg extension to .jpg', () => {
    const jpegData = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const tempDir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'test_jpeg_'));
    const url = saveBase64Image(jpegData, 'photo_test', tempDir);
    expect(url).toMatch(/\.jpg$/);
    require('fs').rmSync(tempDir, { recursive: true, force: true });
  });

  it('G3. generateILSHTMLPages embeds custom base64 stamp into HTML', () => {
    const customStamp = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const tempDir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'test_ils_stamp_'));
    const payload = {
      identity: { name: 'Test School', stamp: customStamp, tier: 'Gold' },
      students: [{ id: 'stu1', name: 'John Doe', class_name: 'Grade 1', il_subjects: [] }],
      termConfig: { term: 'Term 1', academic_session: '2025/2026' },
    };
    const html = generateILSHTMLPages(payload, null, tempDir);
    expect(html).toContain('stamp_stu1');
    expect(html).toMatch(/stamp_stu1_[a-z0-9]+\.png/);
    require('fs').rmSync(tempDir, { recursive: true, force: true });
  });

  it('G4. generateILSHTMLPages generates dynamic SVG stamp when stampStyle is set', () => {
    const tempDir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'test_ils_svg_'));
    const payload = {
      identity: { name: 'Test School', stampStyle: 'classic_round', tier: 'Gold' },
      students: [{ id: 'stu2', name: 'Jane Doe', class_name: 'Grade 1', il_subjects: [] }],
      termConfig: { term: 'Term 1', academic_session: '2025/2026' },
    };
    const html = generateILSHTMLPages(payload, null, tempDir);
    expect(html).toContain('stamp_stu2');
    expect(html).toMatch(/stamp_stu2_[a-z0-9]+\.svg/);
    require('fs').rmSync(tempDir, { recursive: true, force: true });
  });
});
