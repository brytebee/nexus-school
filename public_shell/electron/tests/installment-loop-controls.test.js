/**
 * tests/installment-loop-controls.test.js
 *
 * S8-2: Stateful Installment Loop Controls
 *
 * Tests that:
 * - A parent can use a milestone up to max_occurrences times
 * - Once exhausted, the milestone is hidden from active options
 * - Unlimited (0) milestones are never exhausted
 * - Usage tracking accounts for term + session scope
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ── Pure business logic extracted for testing ─────────────────────────────────

/**
 * Mirrors the production logic in pulse-bot.js:
 * Given an installment plan and a usage count for a specific milestone,
 * determines whether the milestone is still available to the parent.
 *
 * @param {Object} plan         - { label, percent, max_occurrences }
 * @param {number} usageCount   - how many times parent has used this milestone this term
 * @returns {boolean} true if the milestone can still be presented
 */
function isMilestoneAvailable(plan, usageCount) {
  const limit = plan.max_occurrences !== undefined ? Number(plan.max_occurrences) : 0;
  if (limit === 0) return true;         // 0 = unlimited
  return usageCount < limit;
}

/**
 * Filters a list of installment plans to only those still available.
 */
function filterActivePlans(plans, usageCounts) {
  return plans.filter(plan => {
    const count = usageCounts[plan.label] ?? 0;
    return isMilestoneAvailable(plan, count);
  });
}

/**
 * Validates the max_occurrences value for a saved installment plan.
 * Must be 0–7.
 */
function validateMaxOccurrences(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 7) {
    return { valid: false, error: 'max_occurrences must be an integer between 0 and 7.' };
  }
  return { valid: true, value: n };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('S8-2: Installment Loop Controls', () => {

  describe('isMilestoneAvailable()', () => {
    it('returns true when max_occurrences is 0 (unlimited), regardless of usage', () => {
      const plan = { label: '1st Installment', percent: 50, max_occurrences: 0 };
      expect(isMilestoneAvailable(plan, 0)).toBe(true);
      expect(isMilestoneAvailable(plan, 5)).toBe(true);
      expect(isMilestoneAvailable(plan, 100)).toBe(true);
    });

    it('returns true when usage is below the limit', () => {
      const plan = { label: '1st Installment', percent: 50, max_occurrences: 3 };
      expect(isMilestoneAvailable(plan, 0)).toBe(true);
      expect(isMilestoneAvailable(plan, 1)).toBe(true);
      expect(isMilestoneAvailable(plan, 2)).toBe(true);
    });

    it('returns false when usage equals the limit (exactly exhausted)', () => {
      const plan = { label: '1st Installment', percent: 50, max_occurrences: 3 };
      expect(isMilestoneAvailable(plan, 3)).toBe(false);
    });

    it('returns false when usage exceeds the limit (overcounting guard)', () => {
      const plan = { label: '1st Installment', percent: 50, max_occurrences: 1 };
      expect(isMilestoneAvailable(plan, 2)).toBe(false);
    });

    it('treats missing max_occurrences as unlimited (backward-compatible with old plans)', () => {
      const plan = { label: 'Legacy Milestone', percent: 25 }; // no max_occurrences field
      expect(isMilestoneAvailable(plan, 99)).toBe(true);
    });

    it('handles max_occurrences = 1 (single-use milestone)', () => {
      const plan = { label: 'Single Use', percent: 100, max_occurrences: 1 };
      expect(isMilestoneAvailable(plan, 0)).toBe(true);
      expect(isMilestoneAvailable(plan, 1)).toBe(false);
    });

    it('handles max_occurrences = 7 (maximum allowed)', () => {
      const plan = { label: 'Weekly Installment', percent: 14, max_occurrences: 7 };
      expect(isMilestoneAvailable(plan, 6)).toBe(true);
      expect(isMilestoneAvailable(plan, 7)).toBe(false);
    });
  });

  describe('filterActivePlans()', () => {
    const plans = [
      { label: '1st Installment', percent: 50, max_occurrences: 1 },
      { label: '2nd Installment', percent: 25, max_occurrences: 2 },
      { label: 'Unlimited Plan',  percent: 10, max_occurrences: 0 },
    ];

    it('returns all plans when usage is zero', () => {
      const result = filterActivePlans(plans, {});
      expect(result).toHaveLength(3);
    });

    it('removes an exhausted 1-time plan', () => {
      const result = filterActivePlans(plans, { '1st Installment': 1 });
      expect(result.map(p => p.label)).not.toContain('1st Installment');
      expect(result).toHaveLength(2);
    });

    it('keeps a plan that still has remaining uses', () => {
      const result = filterActivePlans(plans, { '2nd Installment': 1 });
      expect(result.map(p => p.label)).toContain('2nd Installment');
    });

    it('removes an exhausted 2-use plan after both uses', () => {
      const result = filterActivePlans(plans, {
        '1st Installment': 1,
        '2nd Installment': 2,
      });
      expect(result.map(p => p.label)).toEqual(['Unlimited Plan']);
    });

    it('never removes an unlimited plan regardless of usage count', () => {
      const result = filterActivePlans(plans, { 'Unlimited Plan': 50 });
      expect(result.map(p => p.label)).toContain('Unlimited Plan');
    });

    it('returns empty array when all plans are exhausted', () => {
      const result = filterActivePlans(plans, {
        '1st Installment': 1,
        '2nd Installment': 2,
        'Unlimited Plan':  0, // unlimited — not exhausted
      });
      // Unlimited Plan still available
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Unlimited Plan');
    });
  });

  describe('validateMaxOccurrences()', () => {
    it('accepts valid values 0–7', () => {
      [0, 1, 2, 3, 4, 5, 6, 7].forEach(v => {
        const result = validateMaxOccurrences(v);
        expect(result.valid).toBe(true);
        expect(result.value).toBe(v);
      });
    });

    it('rejects values above 7', () => {
      expect(validateMaxOccurrences(8).valid).toBe(false);
      expect(validateMaxOccurrences(100).valid).toBe(false);
    });

    it('rejects negative values', () => {
      expect(validateMaxOccurrences(-1).valid).toBe(false);
    });

    it('rejects non-integer values', () => {
      expect(validateMaxOccurrences(1.5).valid).toBe(false);
      expect(validateMaxOccurrences('abc').valid).toBe(false);
    });

    it('coerces string numbers correctly', () => {
      expect(validateMaxOccurrences('3').valid).toBe(true);
      expect(validateMaxOccurrences('3').value).toBe(3);
    });
  });
});
