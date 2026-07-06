'use strict';
/**
 * src/lib/paystackUtils.js
 *
 * Pure utility for Paystack Nigeria transaction fee calculations.
 * This module is shared by pulse-bot.js (checkout link generation),
 * main.js (optional reference), and the test suite.
 *
 * Paystack Nigeria local-card fee structure (as of 2025):
 *   - 1.5 % of the transaction amount
 *   - + ₦100 flat fee for transactions ≥ ₦2,500
 *   - Maximum fee: ₦2,000
 *
 * Design goal: pass-through pricing.
 * The school registers a base amount (what they want to receive).
 * We calculate the GROSS amount the parent must pay so that after
 * Paystack deducts its fee, the school's subaccount receives exactly
 * the base amount.  The fee is therefore borne by the parent.
 *
 * The school ledger (fee_transactions, student_fees) records only the
 * base amount.  The gross and charge are stored in Paystack metadata
 * for full transparency without distorting the school's books.
 */

/**
 * Calculates the gross amount a parent must pay so the school receives
 * exactly `baseAmount` after Paystack deducts its standard transaction fee.
 *
 * Derivation (for the standard ₦100-flat tier):
 *   fee    = gross × 0.015 + 100
 *   gross  = fee + base
 *   gross  = gross × 0.015 + 100 + base
 *   gross  × 0.985 = base + 100
 *   gross  = (base + 100) / 0.985
 *
 * @param {number} baseAmount - Amount the school should receive (Naira, not kobo)
 * @returns {{ gross: number, charge: number }}
 *   gross  — total the parent pays (pass to Paystack `amount` × 100 for kobo)
 *   charge — Paystack processing fee borne by the parent (= gross − base)
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

module.exports = { calculatePaystackCharge, formatNaira };
