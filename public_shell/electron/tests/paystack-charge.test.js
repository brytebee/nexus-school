/**
 * tests/paystack-charge.test.js
 *
 * Verifies the Paystack Nigeria fee pass-through calculation.
 *
 * Core contract: after Paystack deducts its standard fee from `gross`,
 * the school's subaccount must receive exactly `base`.
 *
 *   Paystack fee = gross × 1.5% + ₦100  (for gross ≥ ₦2,500; cap ₦2,000)
 *   Verify:       gross − fee  ≈  base
 */
import { describe, it, expect } from 'vitest';
const { calculatePaystackCharge, formatNaira } = require('../src/lib/paystackUtils.js');

// Helper: simulates what Paystack actually deducts from a gross amount
function paystackFeeOn(gross) {
  if (gross <= 0) return 0;
  const raw = gross < 2500
    ? gross * 0.015
    : gross * 0.015 + 100;
  return Math.min(raw, 2000);
}

describe('calculatePaystackCharge', () => {
  describe('school receives exactly baseAmount after deduction', () => {
    it.each([
      ['₦2,000 (no flat fee tier)',  2_000],
      ['₦10,000 (standard)',         10_000],
      ['₦25,000',                    25_000],
      ['₦50,000',                    50_000],
      ['₦100,000',                   100_000],
      ['₦124,666 (just below cap)',   124_666],
      ['₦200,000 (capped fee)',       200_000],
      ['₦500,000 (large)',            500_000],
    ])(
      '%s → school receives base after deduction',
      (_label, base) => {
        const { gross } = calculatePaystackCharge(base);
        const deducted  = paystackFeeOn(gross);
        // School must receive at least baseAmount (gross rounded up protects this)
        expect(gross - deducted).toBeGreaterThanOrEqual(base - 0.01); // within 1 kobo
        // Over-collection must be less than ₦1 (no excessive rounding)
        expect(gross - deducted - base).toBeLessThan(1);
      }
    );
  });

  describe('charge = gross − base', () => {
    it('charge equals gross minus base for ₦10,000', () => {
      const { gross, charge } = calculatePaystackCharge(10_000);
      expect(charge).toBeCloseTo(gross - 10_000, 2);
    });

    it('charge is always non-negative', () => {
      for (const base of [1000, 5000, 50000, 200000]) {
        const { charge } = calculatePaystackCharge(base);
        expect(charge).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('fee cap at ₦2,000', () => {
    it('charge is exactly ₦2,000 for large amounts (above cap threshold)', () => {
      const { gross, charge } = calculatePaystackCharge(200_000);
      expect(gross).toBe(202_000);
      expect(charge).toBe(2_000);
    });

    it('gross is base + 2000 for amounts above cap threshold', () => {
      const { gross } = calculatePaystackCharge(500_000);
      expect(gross).toBe(502_000);
    });
  });

  describe('edge cases', () => {
    it('returns zero for zero base amount', () => {
      const { gross, charge } = calculatePaystackCharge(0);
      expect(gross).toBe(0);
      expect(charge).toBe(0);
    });

    it('returns zero for negative base amount', () => {
      const { gross, charge } = calculatePaystackCharge(-5000);
      expect(gross).toBe(0);
      expect(charge).toBe(0);
    });

    it('handles non-numeric gracefully', () => {
      const { gross, charge } = calculatePaystackCharge('invalid');
      expect(gross).toBe(0);
      expect(charge).toBe(0);
    });

    it('gross is always greater than base (charge is never zero for positive amounts)', () => {
      const { gross } = calculatePaystackCharge(1000);
      expect(gross).toBeGreaterThan(1000);
    });
  });

  describe('gross is always a valid kobo-rounded amount', () => {
    it('gross has at most 2 decimal places', () => {
      for (const base of [1500, 7777, 33_333, 99_999]) {
        const { gross } = calculatePaystackCharge(base);
        const decimalPart = (gross * 100) % 1;
        expect(decimalPart).toBeCloseTo(0, 5);
      }
    });
  });
});

describe('formatNaira', () => {
  it('formats a round number correctly', () => {
    expect(formatNaira(50000)).toBe('₦50,000.00');
  });

  it('formats a decimal amount correctly', () => {
    expect(formatNaira(10253.81)).toBe('₦10,253.81');
  });

  it('formats zero', () => {
    expect(formatNaira(0)).toBe('₦0.00');
  });
});
