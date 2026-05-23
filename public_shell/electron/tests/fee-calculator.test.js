import { describe, it, expect } from 'vitest';
const { computeFeeStatus, computeBalance, evaluateFeeGate } = require('../src/lib/fee-calculator.js');

describe('fee calculator module', () => {
  describe('computeFeeStatus', () => {
    it('sets cleared when paid is greater than or equal to billed', () => {
      expect(computeFeeStatus(10000, 10000)).toBe('cleared');
      expect(computeFeeStatus(10000, 15000)).toBe('cleared');
    });

    it('sets partial when paid is greater than 0 but less than billed', () => {
      expect(computeFeeStatus(10000, 5000)).toBe('partial');
    });

    it('sets unpaid when paid is 0 or less', () => {
      expect(computeFeeStatus(10000, 0)).toBe('unpaid');
    });
  });

  describe('computeBalance', () => {
    it('correctly calculates remaining debt balance', () => {
      expect(computeBalance(10000, 4000)).toBe(6000);
      expect(computeBalance(10000, 10000)).toBe(0);
    });
  });

  describe('evaluateFeeGate', () => {
    it('permits bypass if gating is disabled', () => {
      const result = evaluateFeeGate({ enabled: false, balance: 5000 });
      expect(result.gated).toBe(false);
    });

    it('enforces fixed threshold rules', () => {
      // threshold = 0 means any positive balance gates the student
      expect(evaluateFeeGate({ enabled: true, mode: 'fixed', threshold: 0, balance: 1 }).gated).toBe(true);
      expect(evaluateFeeGate({ enabled: true, mode: 'fixed', threshold: 0, balance: 0 }).gated).toBe(false);

      // custom positive threshold
      expect(evaluateFeeGate({ enabled: true, mode: 'fixed', threshold: 5000, balance: 4999 }).gated).toBe(false);
      expect(evaluateFeeGate({ enabled: true, mode: 'fixed', threshold: 5000, balance: 5000 }).gated).toBe(true);
    });

    it('enforces percentage-based threshold rules', () => {
      expect(evaluateFeeGate({
        enabled: true,
        mode: 'percent',
        threshold: 50, // gate if unpaid >= 50%
        balance: 4000,
        totalBilled: 10000
      }).gated).toBe(false); // 40% unpaid, passes

      expect(evaluateFeeGate({
        enabled: true,
        mode: 'percent',
        threshold: 50,
        balance: 5000,
        totalBilled: 10000
      }).gated).toBe(true); // 50% unpaid, blocked
    });
  });
});
