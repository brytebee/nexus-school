'use strict';
/**
 * src/lib/paystackUtils.js
 *
 * Pure utility for Paystack Nigeria transaction fee calculations.
 * Shared by pulse-bot.js (checkout link generation), main.js, and the test suite.
 *
 * Paystack Nigeria fee structure:
 *   - Platform Enabling Fee: 1.0% of base amount, capped at ₦1,500 (150,000 kobo)
 *   - Dedicated Virtual Account (DVA) / Bank Transfer: 1.0% of transaction amount, capped at ₦300 (30,000 kobo)
 *   - Local Card Processing Fee: 1.5% (+ ₦100 for ≥ ₦2,500), capped at ₦2,000 (200,000 kobo)
 *
 * Design goal: pass-through pricing.
 * School receives 100% of the base fee intact.
 * Platform receives 1% enabling fee (capped at ₦1,500).
 * Parent pays gross-up based on their selected payment method.
 */

const MAX_PLATFORM_FEE_KOBO = 150000; // ₦1,500 cap
const MAX_CARD_FEE_KOBO     = 200000; // ₦2,000 cap
const MAX_DVA_FEE_KOBO      = 30000;  // ₦300 cap
const FLAT_NIP_FEE_KOBO     = 15000;  // Legacy ₦150 NIP fee (retained for backward compatibility)
const CARD_WAIVER_THRESHOLD = 246250; // ~₦2,462.50 net threshold for gross < ₦2,500

/**
 * Calculates the gross amount a parent must pay so the school receives
 * exactly `baseAmount` after Paystack deducts its standard card transaction fee.
 *
 * @param {number} baseAmount - Amount the school should receive (Naira, not kobo)
 * @returns {{ gross: number, charge: number }}
 */
function calculatePaystackCharge(baseAmount) {
  const base = Number(baseAmount) || 0;
  if (base <= 0) return { gross: 0, charge: 0 };

  let gross;

  if (base > 124_666.67) {
    // Fee is capped at ₦2,000
    gross = base + 2000;
  } else if (base >= 2462.50) {
    // ₦100 flat fee applies (gross ≥ ₦2,500 after the solve)
    gross = (base + 100) / 0.985;
  } else {
    // No flat fee (gross < ₦2,500)
    gross = base / 0.985;
  }

  // Round UP to the nearest kobo so the school always receives at least baseAmount
  gross = Math.ceil(gross * 100) / 100;
  const charge = Math.round((gross - base) * 100) / 100;

  return { gross, charge };
}

/**
 * Formats a Naira amount for display in WhatsApp messages.
 * @param {number} amount
 * @returns {string}  e.g. "₦50,762.00"
 */
function formatNaira(amount) {
  return `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Calculates the full fee breakdown for both DVA (Bank Transfer) and Card channels,
 * identifying which is cheaper and by how much. Mirrors the cloud fee-calculator engine.
 *
 * @param {number} amountNaira  - Base fee amount in Naira
 * @returns {object}            - Full breakdown object
 */
function calculatePaymentBreakdown(amountNaira) {
  const baseKobo = Math.max(0, Math.round(amountNaira * 100));

  // Platform enabling fee: 1.0% capped at ₦1,500
  const platformFeeKobo = Math.min(MAX_PLATFORM_FEE_KOBO, Math.round(baseKobo * 0.01));
  const platformFeeNaira = platformFeeKobo / 100;

  const grossBeforeGatewayKobo = baseKobo + platformFeeKobo;

  // Card gateway fee (1.5% + ₦100, capped at ₦2,000)
  let cardFeeKobo;
  if (grossBeforeGatewayKobo < CARD_WAIVER_THRESHOLD) {
    const gross = Math.ceil(grossBeforeGatewayKobo / 0.985);
    cardFeeKobo = gross - grossBeforeGatewayKobo;
  } else {
    const gross = Math.ceil((grossBeforeGatewayKobo + 10000) / 0.985);
    const uncappedFee = gross - grossBeforeGatewayKobo;
    cardFeeKobo = Math.min(MAX_CARD_FEE_KOBO, uncappedFee);
  }

  // DVA / Bank Transfer fee (1.0%, capped at ₦300)
  const uncappedDvaGross = Math.ceil(grossBeforeGatewayKobo / 0.99);
  const uncappedDvaFee = uncappedDvaGross - grossBeforeGatewayKobo;
  const dvaFeeKobo = Math.min(MAX_DVA_FEE_KOBO, uncappedDvaFee);

  const cardGrossKobo     = grossBeforeGatewayKobo + cardFeeKobo;
  const dvaGrossKobo      = grossBeforeGatewayKobo + dvaFeeKobo;

  const isDvaCheaper     = dvaFeeKobo <= cardFeeKobo;
  const cheapestChannel  = isDvaCheaper ? 'bank_transfer' : 'card';
  const savingsNaira     = Math.abs(cardFeeKobo - dvaFeeKobo) / 100;

  const dvaQuote = {
    gatewayFeeKobo: dvaFeeKobo,
    gatewayFeeNaira: dvaFeeKobo / 100,
    grossKobo: dvaGrossKobo,
    grossNaira: dvaGrossKobo / 100,
    isCheapest: isDvaCheaper,
  };

  const cardQuote = {
    gatewayFeeKobo: cardFeeKobo,
    gatewayFeeNaira: cardFeeKobo / 100,
    grossKobo: cardGrossKobo,
    grossNaira: cardGrossKobo / 100,
    isCheapest: !isDvaCheaper,
  };

  return {
    baseKobo,
    baseNaira: baseKobo / 100,
    platformFeeKobo,
    platformFeeNaira,
    grossBeforeGatewayKobo,
    cheapestChannel,
    savingsNaira,
    card: cardQuote,
    dva: dvaQuote,
    transfer: dvaQuote, // Aliased to dva for 100% backward compatibility
  };
}

/**
 * Calculates Paystack split configuration for Hosted Checkout transactions.
 * When bearer='account' and transaction_charge = platformFeeKobo + gatewayFeeKobo:
 * 1. Parent pays grossKobo (base + platform fee + Paystack fee).
 * 2. Paystack deducts its fee (gatewayFeeKobo) from the transaction_charge.
 * 3. School subaccount receives: grossKobo - transaction_charge = baseKobo (100% intact).
 * 4. Platform receives: transaction_charge - gatewayFeeKobo = platformFeeKobo (100% intact).
 */
function getHostedCheckoutSplitParams(breakdown, channel = 'card') {
  const isCard = channel === 'card';
  const gatewayFeeKobo = isCard ? breakdown.card.gatewayFeeKobo : breakdown.card.gatewayFeeKobo;
  return {
    bearer: 'account',
    transactionChargeKobo: breakdown.platformFeeKobo + gatewayFeeKobo,
  };
}

module.exports = {
  calculatePaystackCharge,
  calculatePaymentBreakdown,
  getHostedCheckoutSplitParams,
  formatNaira,
  MAX_PLATFORM_FEE_KOBO,
  MAX_CARD_FEE_KOBO,
  MAX_DVA_FEE_KOBO,
  FLAT_NIP_FEE_KOBO,
};
