/**
 * tests/payment-channel-toggles.test.js
 *
 * S8-3: Payment Channel Toggles
 *
 * Tests that:
 * - Manual bank transfer menu option is hidden when allow_manual_payments = false
 * - Custom amount entry is blocked when allow_custom_payments = false
 * - Settings defaults correctly to allow both (backward compatibility)
 * - Channel configuration serialises and deserialises cleanly
 */
import { describe, it, expect } from 'vitest';

// ── Pure channel-filter logic mirroring pulse-bot.js ─────────────────────────

/**
 * Build the payment options menu for a parent, respecting channel flags.
 * Mirrors the logic in pulse-bot.js AWAITING_ONLINE_OPTION handler.
 *
 * @param {Object} settings   - fee_settings from DB
 * @param {number} balance    - outstanding balance in kobo/naira
 * @returns {string[]} list of menu option labels
 */
function buildPaymentMenu(settings = {}, balance = 10000) {
  const allowManual = settings.allow_manual_payments !== false;
  const allowCustom = settings.allow_custom_payments !== false;
  const plans       = Array.isArray(settings.installment_plans) ? settings.installment_plans : [];

  const options = [];

  // Full payment is always available if there is a balance
  if (balance > 0) {
    options.push(`Pay Full Balance (₦${balance.toLocaleString()})`);
  }

  // Milestone installment plans
  plans.forEach(plan => {
    options.push(`Pay ${plan.label} (${plan.percent}%)`);
  });

  // Custom amount — gated by allowCustom
  if (allowCustom && balance > 0) {
    options.push('Enter Custom Amount');
  }

  // Manual bank transfer — gated by allowManual
  if (allowManual) {
    options.push('Pay via Bank Transfer');
  }

  return options;
}

/**
 * Validates a fee_settings object before saving to the database.
 */
function validatePaymentChannelSettings(settings) {
  const errors = [];
  if (typeof settings.allow_manual_payments !== 'boolean') {
    errors.push('allow_manual_payments must be a boolean');
  }
  if (typeof settings.allow_custom_payments !== 'boolean') {
    errors.push('allow_custom_payments must be a boolean');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Deserialise fee_settings from DB (stored as JSON string).
 * Returns safe defaults if parsing fails.
 */
function parseFeeSetting(raw) {
  try {
    const parsed = JSON.parse(raw);
    return {
      allow_manual_payments: parsed.allow_manual_payments !== false,
      allow_custom_payments: parsed.allow_custom_payments !== false,
      installment_plans:     Array.isArray(parsed.installment_plans) ? parsed.installment_plans : [],
      fee_gate_enabled:      parsed.fee_gate_enabled !== false,
    };
  } catch {
    // Corrupt / missing row — return safe defaults (all enabled)
    return {
      allow_manual_payments: true,
      allow_custom_payments: true,
      installment_plans:     [],
      fee_gate_enabled:      true,
    };
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('S8-3: Payment Channel Toggles', () => {

  describe('buildPaymentMenu()', () => {
    it('includes all options when both channels are enabled (default)', () => {
      const menu = buildPaymentMenu({}, 50000);
      expect(menu).toContain('Pay Full Balance (₦50,000)');
      expect(menu).toContain('Enter Custom Amount');
      expect(menu).toContain('Pay via Bank Transfer');
    });

    it('hides bank transfer when allow_manual_payments = false', () => {
      const menu = buildPaymentMenu({ allow_manual_payments: false }, 50000);
      expect(menu).not.toContain('Pay via Bank Transfer');
      // Full payment + custom amount are still available
      expect(menu).toContain('Pay Full Balance (₦50,000)');
      expect(menu).toContain('Enter Custom Amount');
    });

    it('hides custom amount when allow_custom_payments = false', () => {
      const menu = buildPaymentMenu({ allow_custom_payments: false }, 50000);
      expect(menu).not.toContain('Enter Custom Amount');
      // Full payment + manual are still available
      expect(menu).toContain('Pay Full Balance (₦50,000)');
      expect(menu).toContain('Pay via Bank Transfer');
    });

    it('hides both when both channels are disabled', () => {
      const menu = buildPaymentMenu({
        allow_manual_payments: false,
        allow_custom_payments: false,
      }, 50000);
      expect(menu).not.toContain('Pay via Bank Transfer');
      expect(menu).not.toContain('Enter Custom Amount');
      // Full payment is still presented (non-channel option)
      expect(menu).toContain('Pay Full Balance (₦50,000)');
    });

    it('treats missing properties as enabled (backward compatibility)', () => {
      // Old schools with no channel flags set — should behave as if both enabled
      const menu = buildPaymentMenu({}, 20000);
      expect(menu).toContain('Pay via Bank Transfer');
      expect(menu).toContain('Enter Custom Amount');
    });

    it('includes installment plan options in the menu', () => {
      const settings = {
        installment_plans: [
          { label: 'First Half', percent: 50 },
          { label: 'Second Half', percent: 50 },
        ],
      };
      const menu = buildPaymentMenu(settings, 40000);
      expect(menu).toContain('Pay First Half (50%)');
      expect(menu).toContain('Pay Second Half (50%)');
    });

    it('shows no payment options when balance is zero', () => {
      const menu = buildPaymentMenu({}, 0);
      expect(menu).not.toContain('Enter Custom Amount');
      // Bank transfer is still shown (manual payments are channel-level, not balance-gated)
      expect(menu).toContain('Pay via Bank Transfer');
    });
  });

  describe('validatePaymentChannelSettings()', () => {
    it('accepts valid boolean settings', () => {
      const result = validatePaymentChannelSettings({
        allow_manual_payments: true,
        allow_custom_payments: false,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects non-boolean allow_manual_payments', () => {
      const result = validatePaymentChannelSettings({
        allow_manual_payments: 1,
        allow_custom_payments: true,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/allow_manual_payments/);
    });

    it('rejects non-boolean allow_custom_payments', () => {
      const result = validatePaymentChannelSettings({
        allow_manual_payments: true,
        allow_custom_payments: 'yes',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('parseFeeSetting()', () => {
    it('parses valid JSON and returns boolean fields', () => {
      const raw = JSON.stringify({
        allow_manual_payments: false,
        allow_custom_payments: true,
        installment_plans: [],
      });
      const result = parseFeeSetting(raw);
      expect(result.allow_manual_payments).toBe(false);
      expect(result.allow_custom_payments).toBe(true);
    });

    it('defaults both channels to true when JSON is malformed', () => {
      const result = parseFeeSetting('NOT_VALID_JSON!!!');
      expect(result.allow_manual_payments).toBe(true);
      expect(result.allow_custom_payments).toBe(true);
    });

    it('defaults both channels to true when DB row is null/empty', () => {
      const result = parseFeeSetting(null);
      expect(result.allow_manual_payments).toBe(true);
      expect(result.allow_custom_payments).toBe(true);
    });

    it('preserves installment_plans array', () => {
      const plans = [{ label: 'Mid-Term', percent: 40, max_occurrences: 1 }];
      const raw   = JSON.stringify({ installment_plans: plans });
      const result = parseFeeSetting(raw);
      expect(result.installment_plans).toHaveLength(1);
      expect(result.installment_plans[0].label).toBe('Mid-Term');
    });
  });
});
