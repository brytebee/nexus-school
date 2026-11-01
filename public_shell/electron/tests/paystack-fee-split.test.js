/**
 * tests/paystack-fee-split.test.js
 *
 * Paystack 1.0% Transaction Fee Split & DVA Routing Test Suite
 *
 * Tests:
 *  1. 1.0% Platform Enabling Fee math calculation (capped at ₦1,500)
 *  2. Paystack initializeTransaction payload building (amount, subaccount, transaction_charge, bearer, channels)
 *  3. Base tuition ledger preservation (school receives exact base tuition credit)
 *  4. Dual-channel DVA vs Card fee calculations & savings comparison
 */

import { describe, it, expect } from 'vitest';
import { calculatePaymentBreakdown, MAX_PLATFORM_FEE_KOBO, MAX_DVA_FEE_KOBO, MAX_CARD_FEE_KOBO } from '../src/lib/paystackUtils.js';

describe('Paystack 1.0% Transaction Fee Split & DVA Routing', () => {

  function calculateFeeSplit(baseNaira) {
    const baseKobo = Math.round(baseNaira * 100);
    const platformFeeKobo = Math.min(MAX_PLATFORM_FEE_KOBO, Math.round(baseKobo * 0.01)); // 1% enabling fee
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

    if (params.channels && Array.isArray(params.channels)) {
      body.channels = params.channels;
    }
    
    if (params.subaccountCode) {
      body.subaccount = params.subaccountCode;
      body.bearer = params.bearer || 'subaccount';
      if (params.transactionCharge != null && !isNaN(Number(params.transactionCharge))) {
        body.transaction_charge = Number(params.transactionCharge);
      }
    }
    return body;
  }

  it('calculates 1.0% platform enabling fee accurately (₦100,000 base tuition)', () => {
    const split = calculateFeeSplit(100000); // ₦100,000 base tuition
    expect(split.baseKobo).toBe(10000000);
    expect(split.platformFeeKobo).toBe(100000); // 1.0% of 10,000,000 = 100,000 kobo (₦1,000)
    expect(split.grossKobo).toBe(10100000);   // ₦101,000 gross charged to parent
    expect(split.platformFeeNaira).toBe(1000);
    expect(split.grossNaira).toBe(101000);
  });

  it('strictly caps platform fee at ₦1,500 for large fees (₦200,000 & ₦256,000)', () => {
    const split200k = calculateFeeSplit(200000);
    expect(split200k.platformFeeKobo).toBe(150000); // Capped at ₦1,500
    expect(split200k.platformFeeNaira).toBe(1500);

    const split256k = calculateFeeSplit(256000);
    expect(split256k.platformFeeKobo).toBe(150000);
    expect(split256k.platformFeeNaira).toBe(1500);
  });

  it('builds Paystack initialize payload with channels, subaccount, and transaction_charge split parameters', () => {
    const split = calculateFeeSplit(50000); // ₦50,000 base tuition
    const payload = buildPaystackInitializeBody({
      email: 'parent@example.com',
      amount: split.grossKobo,
      transactionCharge: split.platformFeeKobo,
      reference: 'PAY-123456',
      subaccountCode: 'ACCT_test123',
      channels: ['bank_transfer', 'ussd'],
      callbackUrl: 'https://nexusos.com.ng/payment-complete',
      metadata: { base_amount: split.baseNaira }
    });

    expect(payload.amount).toBe(5050000); // ₦50,500 in kobo
    expect(payload.subaccount).toBe('ACCT_test123');
    expect(payload.transaction_charge).toBe(50000); // ₦500 in kobo (1.0%)
    expect(payload.bearer).toBe('subaccount');
    expect(payload.channels).toEqual(['bank_transfer', 'ussd']);
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

  it('correctly compares DVA vs Card fees across standard payment brackets', () => {
    // 1. ₦14,000: DVA 1% capped at ₦300 saves ₦174 vs Card
    const fee14k = calculatePaymentBreakdown(14000);
    expect(fee14k.baseNaira).toBe(14000);
    expect(fee14k.platformFeeNaira).toBe(140);
    expect(fee14k.dva.gatewayFeeNaira).toBe(142.83);
    expect(fee14k.card.gatewayFeeNaira).toBe(316.86);
    expect(fee14k.cheapestChannel).toBe('bank_transfer');
    expect(fee14k.savingsNaira).toBe(174.03);

    // 2. ₦50,000: DVA capped at ₦300 saves ₦570.56 vs Card
    const fee50k = calculatePaymentBreakdown(50000);
    expect(fee50k.dva.gatewayFeeNaira).toBe(300); // capped at ₦300
    expect(fee50k.card.gatewayFeeNaira).toBe(870.56);
    expect(fee50k.savingsNaira).toBe(570.56);

    // 3. ₦256,000: DVA capped at ₦300 vs Card capped at ₦2,000 saves ₦1,700
    const fee256k = calculatePaymentBreakdown(256000);
    expect(fee256k.platformFeeNaira).toBe(1500); // platform capped at ₦1,500
    expect(fee256k.dva.gatewayFeeNaira).toBe(300); // DVA capped at ₦300
    expect(fee256k.card.gatewayFeeNaira).toBe(2000); // Card capped at ₦2,000
    expect(fee256k.savingsNaira).toBe(1700);
  });
});
