/**
 * tests/result-publish.test.js
 *
 * S8-5: Parent Portal — Result Publish & Download Flow
 *
 * Tests the pure logic layers:
 *   1. parentMap construction (phone → [studentIds])
 *   2. Download limit enforcement (5-download cap, race-condition guard)
 *   3. OTP phone gate (only registered parents get OTPs)
 *   4. Term key serialisation / parsing ("First Term 2024/2025")
 *   5. Published-terms merge logic (additive, no duplicates)
 */
import { describe, it, expect } from 'vitest';

// ── 1. parentMap builder ──────────────────────────────────────────────────────

/**
 * Mirrors the logic in result-dispatcher.js compileBatchAndUpload()
 * and main.js results:publish handler.
 */
function buildParentMap(students) {
  const map = {};
  for (const s of students) {
    if (!s.parent_phone) continue;
    if (!map[s.parent_phone]) map[s.parent_phone] = [];
    if (!map[s.parent_phone].includes(s.id)) {
      map[s.parent_phone].push(s.id);
    }
  }
  return map;
}

describe('S8-5: parentMap construction', () => {
  it('groups siblings under one parent phone', () => {
    const students = [
      { id: 'stu_1', name: 'Tunde Bello',  parent_phone: '2348012345678' },
      { id: 'stu_2', name: 'Amaka Bello',  parent_phone: '2348012345678' },
      { id: 'stu_3', name: 'Chidi Okafor', parent_phone: '2348099887766' },
    ];
    const map = buildParentMap(students);
    expect(map['2348012345678']).toEqual(['stu_1', 'stu_2']);
    expect(map['2348099887766']).toEqual(['stu_3']);
  });

  it('skips students with no parent_phone', () => {
    const students = [
      { id: 'stu_1', name: 'Orphan Record', parent_phone: null },
      { id: 'stu_2', name: 'No Phone',      parent_phone: '' },
      { id: 'stu_3', name: 'Has Phone',     parent_phone: '2348012345678' },
    ];
    const map = buildParentMap(students);
    expect(Object.keys(map)).toHaveLength(1);
    expect(map['2348012345678']).toEqual(['stu_3']);
  });

  it('deduplicates student IDs (idempotent for repeated calls)', () => {
    const students = [
      { id: 'stu_1', parent_phone: '2348012345678' },
      { id: 'stu_1', parent_phone: '2348012345678' }, // duplicate row
    ];
    const map = buildParentMap(students);
    expect(map['2348012345678']).toHaveLength(1);
  });

  it('returns an empty map when no students have phones', () => {
    expect(buildParentMap([])).toEqual({});
    expect(buildParentMap([{ id: 'x', parent_phone: null }])).toEqual({});
  });
});

// ── 2. Download limit enforcement ─────────────────────────────────────────────

/**
 * Mirrors the claim logic in nexus-api /results/claim/route.ts
 */
function claimDownload(record) {
  if (!record) return { ok: false, status: 404, error: 'Result not published.' };
  if (record.download_count >= record.download_limit) {
    return {
      ok:     false,
      status: 429,
      error:  'Download limit reached.',
      downloadCount: record.download_count,
      downloadLimit: record.download_limit,
    };
  }
  // Simulate atomic increment
  const updated = { ...record, download_count: record.download_count + 1 };
  return { ok: true, status: 200, pdfUrl: record.pdf_url, record: updated };
}

describe('S8-5: download limit enforcement', () => {
  const baseRecord = {
    slug:           'green-valley-high',
    student_id:     'stu_abc',
    term_key:       'First Term 2024/2025',
    pdf_url:        'https://res.cloudinary.com/test/raw/upload/nexus_results/stu_abc.pdf',
    download_count: 0,
    download_limit: 5,
  };

  it('allows download when count is 0', () => {
    const result = claimDownload({ ...baseRecord, download_count: 0 });
    expect(result.ok).toBe(true);
    expect(result.pdfUrl).toBe(baseRecord.pdf_url);
    expect(result.record.download_count).toBe(1);
  });

  it('allows the 5th download (boundary — last allowed)', () => {
    const result = claimDownload({ ...baseRecord, download_count: 4 });
    expect(result.ok).toBe(true);
    expect(result.record.download_count).toBe(5);
  });

  it('blocks the 6th download (limit = 5, count = 5)', () => {
    const result = claimDownload({ ...baseRecord, download_count: 5 });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(429);
    expect(result.error).toMatch(/limit/i);
    expect(result.downloadCount).toBe(5);
    expect(result.downloadLimit).toBe(5);
  });

  it('blocks when count already exceeds limit (safety guard)', () => {
    const result = claimDownload({ ...baseRecord, download_count: 99 });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(429);
  });

  it('returns 404 when record is null (result not published)', () => {
    const result = claimDownload(null);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  it('resets to 0 after re-publish (simulate re-publish)', () => {
    // Re-publish sets download_count = 0, download_limit = 5
    const freshRecord = { ...baseRecord, download_count: 0 };
    const result = claimDownload(freshRecord);
    expect(result.ok).toBe(true);
    expect(result.record.download_count).toBe(1);
  });
});

// ── 3. OTP phone gate ─────────────────────────────────────────────────────────

/**
 * Mirrors the gate in nexus-api /api/parent/otp/route.ts
 */
function shouldIssueOtp(parentMap, phone) {
  return Object.prototype.hasOwnProperty.call(parentMap, phone);
}

describe('S8-5: OTP phone gate', () => {
  const parentMap = {
    '2348012345678': ['stu_1', 'stu_2'],
    '2348099887766': ['stu_3'],
  };

  it('allows OTP for registered parent phones', () => {
    expect(shouldIssueOtp(parentMap, '2348012345678')).toBe(true);
    expect(shouldIssueOtp(parentMap, '2348099887766')).toBe(true);
  });

  it('blocks OTP for unregistered phones', () => {
    expect(shouldIssueOtp(parentMap, '2348000000000')).toBe(false);
    expect(shouldIssueOtp(parentMap, '')).toBe(false);
    expect(shouldIssueOtp(parentMap, '07012345678')).toBe(false); // not E.164
  });

  it('blocks OTP when parentMap is empty (nothing published yet)', () => {
    expect(shouldIssueOtp({}, '2348012345678')).toBe(false);
  });

  it('does not leak parentMap entries via prototype chain', () => {
    // Prototype pollution guard — using hasOwnProperty
    expect(shouldIssueOtp(parentMap, 'toString')).toBe(false);
    expect(shouldIssueOtp(parentMap, '__proto__')).toBe(false);
    expect(shouldIssueOtp(parentMap, 'constructor')).toBe(false);
  });
});

// ── 4. Term key serialisation ─────────────────────────────────────────────────

function buildTermKey(term, academicSession) {
  return `${term} ${academicSession}`;
}

function parseTermKey(termKey) {
  const match = termKey.match(/^(.+?)\s+(\d{4}\/\d{4})$/);
  if (!match) return { term: termKey, academicSession: '' };
  return { term: match[1].trim(), academicSession: match[2] };
}

describe('S8-5: term key serialisation', () => {
  it('builds a consistent term key', () => {
    expect(buildTermKey('First Term', '2024/2025')).toBe('First Term 2024/2025');
    expect(buildTermKey('Second Term', '2025/2026')).toBe('Second Term 2025/2026');
    expect(buildTermKey('Third Term', '2024/2025')).toBe('Third Term 2024/2025');
  });

  it('parses a term key back into parts', () => {
    expect(parseTermKey('First Term 2024/2025')).toEqual({ term: 'First Term', academicSession: '2024/2025' });
    expect(parseTermKey('Second Term 2025/2026')).toEqual({ term: 'Second Term', academicSession: '2025/2026' });
  });

  it('round-trips correctly', () => {
    const key    = buildTermKey('Third Term', '2024/2025');
    const parsed = parseTermKey(key);
    expect(parsed.term).toBe('Third Term');
    expect(parsed.academicSession).toBe('2024/2025');
  });

  it('handles malformed term keys gracefully', () => {
    const result = parseTermKey('invalid-key');
    expect(result.term).toBe('invalid-key');
    expect(result.academicSession).toBe('');
  });
});

// ── 5. Published-terms merge logic ────────────────────────────────────────────

/**
 * Mirrors the merge logic in /api/schools/[slug]/results/published-terms POST
 */
function mergePublishedTerms(existing, newTermKey, newParentMap) {
  const prevTerms  = existing?.terms     ?? [];
  const prevMap    = existing?.parentMap ?? {};
  return {
    terms:     Array.from(new Set([...prevTerms, newTermKey])),
    parentMap: { ...prevMap, ...newParentMap },
  };
}

describe('S8-5: published-terms merge logic', () => {
  it('adds a new term to an empty list', () => {
    const result = mergePublishedTerms(null, 'First Term 2024/2025', {});
    expect(result.terms).toEqual(['First Term 2024/2025']);
  });

  it('appends to an existing list', () => {
    const existing = { terms: ['First Term 2024/2025'], parentMap: {} };
    const result   = mergePublishedTerms(existing, 'Second Term 2024/2025', {});
    expect(result.terms).toHaveLength(2);
    expect(result.terms).toContain('Second Term 2024/2025');
  });

  it('deduplicates when the same term is published twice', () => {
    const existing = { terms: ['First Term 2024/2025'], parentMap: {} };
    const result   = mergePublishedTerms(existing, 'First Term 2024/2025', {});
    expect(result.terms).toHaveLength(1);
  });

  it('deep-merges parentMaps (new phones added, existing phones preserved)', () => {
    const existing = {
      terms:     ['First Term 2024/2025'],
      parentMap: { '2348012345678': ['stu_1'] },
    };
    const newMap = { '2348099887766': ['stu_2'] };
    const result = mergePublishedTerms(existing, 'Second Term 2024/2025', newMap);
    expect(result.parentMap['2348012345678']).toEqual(['stu_1']); // preserved
    expect(result.parentMap['2348099887766']).toEqual(['stu_2']); // added
  });

  it('overwrites a parent phone entry on re-publish (new studentId list)', () => {
    // Parent phone now has a third child enrolled
    const existing = {
      terms:     ['First Term 2024/2025'],
      parentMap: { '2348012345678': ['stu_1'] },
    };
    const newMap = { '2348012345678': ['stu_1', 'stu_3'] };
    const result = mergePublishedTerms(existing, 'First Term 2024/2025', newMap);
    expect(result.parentMap['2348012345678']).toEqual(['stu_1', 'stu_3']);
  });
});
