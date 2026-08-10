/**
 * pulse-phone-matching.test.js
 *
 * Unit tests for v1.0.80 / v1.0.81 Pulse Bot fixes:
 *  1. getMatchableDigits  — normalises every phone format to last 10 digits
 *  2. findStudentsByPhone — returns ALL siblings regardless of stored format
 *  3. numericInput regex  — /^[1-9]\d*$/ accepts 7/8/9 and multi-digit inputs
 *  4. Extras comma-parser — "1,2,3" parses to [0, 1, 2] indices
 */

import { describe, it, expect } from 'vitest';

const { getMatchableDigits, findStudentsByPhone } = require('../pulse-bot.js');

// ─── Helper ───────────────────────────────────────────────────────────────────
function mockDb(students) {
  return { prepare: () => ({ all: () => students }) };
}
const OTHER = { id: 99, name: 'Other', class_name: 'JSS1', class_arm: 'A', parent_name: 'X', parent_phone: '09011111111' };

// ─── 1. getMatchableDigits ────────────────────────────────────────────────────

describe('getMatchableDigits', () => {
  const EXP = '8012345678';

  it('E.164 without plus (2348012345678)', () => expect(getMatchableDigits('2348012345678')).toBe(EXP));
  it('+234 prefix (+2348012345678)', () => expect(getMatchableDigits('+2348012345678')).toBe(EXP));
  it('local leading-zero (08012345678)', () => expect(getMatchableDigits('08012345678')).toBe(EXP));
  it('bare 10 digits — missing-zero case (8012345678)', () => expect(getMatchableDigits('8012345678')).toBe(EXP));
  it('dashes (+234-801-234-5678)', () => expect(getMatchableDigits('+234-801-234-5678')).toBe(EXP));
  it('spaces (+234 801 234 5678)', () => expect(getMatchableDigits('+234 801 234 5678')).toBe(EXP));
  it('spaces (0801 234 5678)', () => expect(getMatchableDigits('0801 234 5678')).toBe(EXP));
  it('parentheses ((0)8012345678)', () => expect(getMatchableDigits('(0)8012345678')).toBe(EXP));
  it('numeric input type', () => expect(getMatchableDigits(2348012345678)).toBe(EXP));

  it('returns null for null / undefined / empty', () => {
    expect(getMatchableDigits(null)).toBeNull();
    expect(getMatchableDigits(undefined)).toBeNull();
    expect(getMatchableDigits('')).toBeNull();
  });
  it('returns null when fewer than 10 significant digits', () => {
    expect(getMatchableDigits('012345678')).toBeNull();
  });
});

// ─── 2. findStudentsByPhone ───────────────────────────────────────────────────

describe('findStudentsByPhone', () => {
  const M = '8012345678';

  it('finds child stored as leading-zero local (08012345678)', () => {
    const db = mockDb([{ id: 1, name: 'Tunde', class_name: 'JSS1', class_arm: 'A', parent_name: 'P', parent_phone: '08012345678' }, OTHER]);
    expect(findStudentsByPhone(db, M)).toHaveLength(1);
    expect(findStudentsByPhone(db, M)[0].name).toBe('Tunde');
  });

  it('finds child stored WITHOUT leading zero (8012345678)', () => {
    const db = mockDb([{ id: 2, name: 'Sola', class_name: 'JSS2', class_arm: 'B', parent_name: 'P', parent_phone: '8012345678' }, OTHER]);
    expect(findStudentsByPhone(db, M)).toHaveLength(1);
  });

  it('finds child stored with +234 prefix', () => {
    const db = mockDb([{ id: 3, name: 'Amaka', class_name: 'SS1', class_arm: 'C', parent_name: 'P', parent_phone: '+2348012345678' }, OTHER]);
    expect(findStudentsByPhone(db, M)).toHaveLength(1);
  });

  it('finds child stored with dashes (+234-801-234-5678) — was BROKEN before v1.0.81', () => {
    const db = mockDb([{ id: 4, name: 'Emeka', class_name: 'JSS3', class_arm: 'A', parent_name: 'P', parent_phone: '+234-801-234-5678' }, OTHER]);
    expect(findStudentsByPhone(db, M)).toHaveLength(1);
  });

  it('finds child stored with spaces (0801 234 5678) — was BROKEN before v1.0.81', () => {
    const db = mockDb([{ id: 5, name: 'Chioma', class_name: 'SS2', class_arm: 'B', parent_name: 'P', parent_phone: '0801 234 5678' }, OTHER]);
    expect(findStudentsByPhone(db, M)).toHaveLength(1);
  });

  // ── THE CORE MULTI-CHILD REGRESSION ──────────────────────────────────────────

  it('returns ALL siblings when each sibling uses a different phone format for the same number', () => {
    /**
     * This is the exact pre-v1.0.81 failure scenario:
     *   LIKE '%8012345678'  matched  '08012345678'      ✓
     *                  but missed  '+234-801-234-5678'  ✗  (dashes break suffix)
     *                  and missed  '0801 234 5678'      ✗  (spaces break suffix)
     */
    const db = mockDb([
      { id: 10, name: 'Child One',   class_name: 'JSS1', class_arm: 'A', parent_name: 'Mrs Adeyemi', parent_phone: '08012345678' },
      { id: 11, name: 'Child Two',   class_name: 'JSS2', class_arm: 'B', parent_name: 'Mrs Adeyemi', parent_phone: '+234-801-234-5678' },
      { id: 12, name: 'Child Three', class_name: 'SS1',  class_arm: 'C', parent_name: 'Mrs Adeyemi', parent_phone: '8012345678' },
      OTHER,
    ]);
    const result = findStudentsByPhone(db, M);
    expect(result).toHaveLength(3);
    const names = result.map(s => s.name);
    expect(names).toContain('Child One');
    expect(names).toContain('Child Two');
    expect(names).toContain('Child Three');
  });

  it('returns both siblings when stored as leading-zero vs bare-digit variants', () => {
    const db = mockDb([
      { id: 20, name: 'Biodun',  class_name: 'JSS1', class_arm: 'A', parent_name: 'Mr Lawal', parent_phone: '08012345678' },
      { id: 21, name: 'Kelechi', class_name: 'JSS3', class_arm: 'B', parent_name: 'Mr Lawal', parent_phone: '8012345678' },
      OTHER,
    ]);
    expect(findStudentsByPhone(db, M)).toHaveLength(2);
  });

  it('excludes students whose phone resolves to a different 10-digit key', () => {
    const db = mockDb([
      { id: 30, name: 'Right', class_name: 'JSS1', class_arm: 'A', parent_name: 'R', parent_phone: '08012345678' },
      { id: 31, name: 'Wrong', class_name: 'JSS2', class_arm: 'B', parent_name: 'W', parent_phone: '09087654321' },
    ]);
    const result = findStudentsByPhone(db, M);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Right');
  });

  it('returns [] when no students match', () => {
    expect(findStudentsByPhone(mockDb([OTHER]), M)).toHaveLength(0);
  });

  it('returns [] when matchable is null', () => {
    const db = mockDb([{ id: 40, name: 'Anyone', class_name: 'JSS1', class_arm: 'A', parent_name: 'P', parent_phone: '08012345678' }]);
    expect(findStudentsByPhone(db, null)).toHaveLength(0);
  });

  it('skips students with null or empty parent_phone without throwing', () => {
    const db = mockDb([
      { id: 50, name: 'No Phone', class_name: 'JSS1', class_arm: 'A', parent_name: null, parent_phone: null },
      { id: 51, name: 'Empty',    class_name: 'JSS2', class_arm: 'B', parent_name: null, parent_phone: '' },
    ]);
    expect(findStudentsByPhone(db, M)).toHaveLength(0);
  });
});

// ─── 3. numericInput regex /^[1-9]\d*$/ ──────────────────────────────────────

describe('numericInput regex /^[1-9]\\d*$/ (widened from /^[1-6]$/ in v1.0.80)', () => {
  const regex = /^[1-9]\d*$/;

  it('accepts 1–6 (original range)', () => {
    ['1','2','3','4','5','6'].forEach(n => expect(regex.test(n)).toBe(true));
  });

  it('accepts 7, 8, 9 — "9" was the custom-amount bug trigger', () => {
    ['7','8','9'].forEach(n => expect(regex.test(n)).toBe(true));
  });

  it('accepts multi-digit positive integers (e.g. milestone plan index 10)', () => {
    ['10','15','100'].forEach(n => expect(regex.test(n)).toBe(true));
  });

  it('rejects 0 — cancel uses text === "0" separately', () => {
    expect(regex.test('0')).toBe(false);
  });

  it('rejects negative numbers, decimals, and comma-separated input', () => {
    ['-1','1.5','1,2'].forEach(n => expect(regex.test(n)).toBe(false));
  });

  it('rejects non-numeric strings', () => {
    ['hello','',' ','abc123'].forEach(n => expect(regex.test(n)).toBe(false));
  });
});

// ─── 4. Extras comma-selection parser ────────────────────────────────────────

function parseExtrasSelection(text, totalExtras) {
  const rawParts = text.split(',').map(p => p.trim()).filter(Boolean);
  const selectedIndices = rawParts
    .map(p => parseInt(p, 10) - 1)
    .filter(i => !isNaN(i) && i >= 0 && i < totalExtras);
  return [...new Set(selectedIndices)];
}

describe('extras comma-selection parser', () => {
  it('"1" → [0] (single item)', () => expect(parseExtrasSelection('1', 3)).toEqual([0]));
  it('"1,2,3" → [0,1,2]', () => expect(parseExtrasSelection('1,2,3', 3)).toEqual([0,1,2]));
  it('"1, 2, 3" (spaces) → [0,1,2]', () => expect(parseExtrasSelection('1, 2, 3', 3)).toEqual([0,1,2]));
  it('"1,1,2" deduplicates → [0,1]', () => expect(parseExtrasSelection('1,1,2', 3)).toEqual([0,1]));
  it('"5" with only 3 extras → [] (out of range)', () => expect(parseExtrasSelection('5', 3)).toEqual([]));
  it('"1,5" with 3 extras → [0] (valid mixed with invalid)', () => expect(parseExtrasSelection('1,5', 3)).toEqual([0]));
  it('non-numeric text → []', () => expect(parseExtrasSelection('abc', 3)).toEqual([]));
  it('empty string → []', () => expect(parseExtrasSelection('', 3)).toEqual([]));
  it('"0" → [] (cancel is handled before this parser in the state machine)', () => expect(parseExtrasSelection('0', 3)).toEqual([]));
});
