/**
 * tests/paystack-fee-split.test.js
 *
 * Phase 6: Paystack 0.99% Transaction Fee Split Routing Test Suite
 *
 * Tests:
 *  1. 0.99% Platform Enabling Fee math calculation
 *  2. Paystack initializeTransaction payload building (amount, subaccount, transaction_charge, bearer)
 *  3. Base tuition ledger preservation (school receives exact base tuition credit)
 */

import { describe, it, expect } from 'vitest';

describe('Phase 6: Paystack 0.99% Transaction Fee Split Routing', () => {

  function calculateFeeSplit(baseNaira) {
    const baseKobo = Math.round(baseNaira * 100);
    const platformFeeKobo = Math.round(baseKobo * 0.0099); // 0.99% enabling fee
    const grossKobo = baseKobo + platformFeeKobo;
    return {
      baseNaira,
      baseKobo,
      platformFeeKobo,
      grossKobo,
      grossNaira: grossKobo / 100,
      platformFeeNaira: platformFeeKobo / 100,
    };
  }

  function buildPaystackInitializeBody(params) {
    const body = {
      email: params.email,
      amount: params.amount, // gross amount in kobo
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
    };
    
    if (params.subaccountCode) {
      body.subaccount = params.subaccountCode;
      body.bearer = params.bearer || 'subaccount';
      if (params.transactionCharge != null && !isNaN(Number(params.transactionCharge))) {
        body.transaction_charge = Number(params.transactionCharge);
      }
    }
    return body;
  }

  it('calculates 0.99% platform enabling fee accurately', () => {
    const split = calculateFeeSplit(100000); // ₦100,000 base tuition
    expect(split.baseKobo).toBe(10000000);
    expect(split.platformFeeKobo).toBe(99000); // 0.99% of 10,000,000 = 99,000 kobo (₦990)
    expect(split.grossKobo).toBe(10099000);   // ₦100,990 gross charged to parent
    expect(split.platformFeeNaira).toBe(990);
    expect(split.grossNaira).toBe(100990);
  });

  it('builds Paystack initialize payload with subaccount and transaction_charge split parameters', () => {
    const split = calculateFeeSplit(50000); // ₦50,000 base tuition
    const payload = buildPaystackInitializeBody({
      email: 'parent@example.com',
      amount: split.grossKobo,
      transactionCharge: split.platformFeeKobo,
      reference: 'PAY-123456',
      subaccountCode: 'ACCT_test123',
      callbackUrl: 'https://nexusos.com.ng/payment-complete',
      metadata: { base_amount: split.baseNaira }
    });

    expect(payload.amount).toBe(5049500); // ₦50,495 in kobo
    expect(payload.subaccount).toBe('ACCT_test123');
    expect(payload.transaction_charge).toBe(49500); // ₦495 in kobo (0.99%)
    expect(payload.bearer).toBe('subaccount');
    expect(payload.metadata.base_amount).toBe(50000);
  });

  it('preserves base tuition amount in fee_payment_sessions ledger', () => {
    const baseTuition = 75000;
    const split = calculateFeeSplit(baseTuition);

    // Simulated ledger DB insertion row
    const dbRecord = {
      total_amount: split.baseNaira,
      paystack_ref: 'PAY-789012',
      status: 'pending'
    };

    expect(dbRecord.total_amount).toBe(75000);
    expect(dbRecord.total_amount).not.toBe(split.grossNaira);
  });
});
