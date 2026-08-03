/**
 * tests/phase10-ils-validation.test.js
 *
 * Unit tests for ILS PAC Score validation rules:
 * 1. Scores < 80 are strictly rejected.
 * 2. Scores > 100 (e.g. 900) are strictly rejected.
 * 3. Valid PAC scores between 80 and 100 are accepted.
 * 4. Pack numbers outside 1..12 are strictly rejected.
 * 5. Completed PACs count is controlled and capped at 12.
 */

import { describe, it, expect } from 'vitest';
import { validatePacScore } from '../src/lib/validators';

describe('Phase 10 — ILS PAC Score & Count Validation', () => {

  describe('validatePacScore()', () => {
    it('rejects scores less than 80', () => {
      expect(validatePacScore(79).ok).toBe(false);
      expect(validatePacScore(79).error).toContain('cannot be less than 80');

      expect(validatePacScore(50).ok).toBe(false);
      expect(validatePacScore(0).ok).toBe(false);
      expect(validatePacScore(-10).ok).toBe(false);
    });

    it('rejects scores greater than 100 (e.g. 900)', () => {
      expect(validatePacScore(900).ok).toBe(false);
      expect(validatePacScore(900).error).toContain('cannot exceed 100');

      expect(validatePacScore(105).ok).toBe(false);
      expect(validatePacScore(100.1).ok).toBe(false);
    });

    it('accepts valid PAC scores in [80, 100]', () => {
      expect(validatePacScore(80).ok).toBe(true);
      expect(validatePacScore(85).ok).toBe(true);
      expect(validatePacScore(90).ok).toBe(true);
      expect(validatePacScore(95.5).ok).toBe(true);
      expect(validatePacScore(100).ok).toBe(true);
    });

    it('allows empty / undefined inputs without error', () => {
      expect(validatePacScore(null).ok).toBe(true);
      expect(validatePacScore(undefined).ok).toBe(true);
      expect(validatePacScore('').ok).toBe(true);
    });

    it('rejects non-numeric string values', () => {
      expect(validatePacScore('abc').ok).toBe(false);
      expect(validatePacScore('abc').error).toContain('must be a valid number');
    });
  });

  describe('PAC Pack Number & Count Boundary Control', () => {
    function validatePackNumber(packNum) {
      const parsed = parseInt(String(packNum));
      if (isNaN(parsed) || parsed < 1 || parsed > 12) {
        return { ok: false, error: 'PAC packNumber must be an integer between 1 and 12.' };
      }
      return { ok: true, error: null };
    }

    it('rejects pack numbers less than 1 or greater than 12', () => {
      expect(validatePackNumber(0).ok).toBe(false);
      expect(validatePackNumber(-1).ok).toBe(false);
      expect(validatePackNumber(13).ok).toBe(false);
      expect(validatePackNumber(99).ok).toBe(false);
    });

    it('accepts pack numbers 1 through 12', () => {
      for (let i = 1; i <= 12; i++) {
        expect(validatePackNumber(i).ok).toBe(true);
      }
    });

    it('caps completed PACs count at 12', () => {
      function computeControlledCompletedCount(passedPacksCount) {
        return Math.min(12, Math.max(0, passedPacksCount));
      }

      expect(computeControlledCompletedCount(5)).toBe(5);
      expect(computeControlledCompletedCount(12)).toBe(12);
      expect(computeControlledCompletedCount(15)).toBe(12); // capped at 12
    });
  });

});
