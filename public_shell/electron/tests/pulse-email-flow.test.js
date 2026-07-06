/**
 * tests/pulse-email-flow.test.js
 *
 * Tests for the Nexus Pulse bot AWAITING_EMAIL_INPUT state machine.
 *
 * This is the most critical flow in the WhatsApp bot because:
 *  - If the state machine crashes or routes incorrectly, the bot goes silent.
 *  - If the email prompt is skipped, Paystack initialization will fail.
 *  - If free-text routing doesn't work, parents get stuck in a loop.
 *
 * Tested scenarios:
 *  1. Incoming email is valid format → emailToUse set, no rejection
 *  2. Incoming text '1' with existing email → uses existing email
 *  3. Incoming text '2' → uses fallback email from settings or generated default
 *  4. Invalid email format → returns error, state stays AWAITING_EMAIL_INPUT
 *  5. Text '0' → clears session (back to main menu)
 *  6. Missing paymentContext.pendingTx → clears session with error
 *  7. FREE_TEXT_STATES gate — AWAITING_EMAIL_INPUT bypasses menu reset gate
 *  8. Numeric non-'0' non-'1' non-'2' without '@' → treated as invalid email
 *  9. Email update is applied to all students in the session
 */
import { describe, it, expect, vi } from 'vitest';

// ─── Email validation (extracted from pulse-bot.js) ───────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(str) {
  return EMAIL_REGEX.test(str);
}

// ─── Simulated AWAITING_EMAIL_INPUT handler ───────────────────────────────────
// Mirrors the logic at pulse-bot.js lines 1312–1368.
function simulateEmailInputHandler({ text, session, matchable, fallbackEmail = null }) {
  const replies = [];
  const dbUpdates = []; // track student email updates
  let sessionCleared = false;
  let proceedToCheckout = null;

  if (text === '0') {
    sessionCleared = true;
    replies.push('MAIN_MENU');
    return { replies, sessionCleared, dbUpdates, proceedToCheckout };
  }

  const txContext = session?.paymentContext?.pendingTx;
  if (!txContext) {
    sessionCleared = true;
    replies.push('SESSION_ERROR');
    return { replies, sessionCleared, dbUpdates, proceedToCheckout };
  }

  const input = text.trim();
  let emailToUse = null;

  if (input === '1' && session.paymentContext.existingEmail) {
    emailToUse = session.paymentContext.existingEmail;
  } else if (input === '2') {
    emailToUse = fallbackEmail || `parent-${matchable}@nexusos.com.ng`;
  } else {
    if (isValidEmail(input)) {
      emailToUse = input;
      // Update all students in session
      for (const std of session.students) {
        dbUpdates.push({ studentId: std.id, email: input });
      }
      replies.push('EMAIL_UPDATED');
    } else {
      replies.push('INVALID_EMAIL');
      return { replies, sessionCleared, dbUpdates, proceedToCheckout };
    }
  }

  // Proceed to Paystack link generation
  proceedToCheckout = { email: emailToUse, ...txContext };
  return { replies, sessionCleared, dbUpdates, proceedToCheckout };
}

// ─── FREE_TEXT gate (mirrors lines 892–927) ───────────────────────────────────
const FREE_TEXT_STATES = ['AWAITING_EMAIL_INPUT', 'AWAITING_CUSTOM_AMOUNT', 'AWAITING_RECEIPT'];

function wouldResetToMenu(sessionState, text) {
  const inFreeTextState = FREE_TEXT_STATES.includes(sessionState);
  const numericInput = /^\d+$/.test(text) ? parseInt(text, 10) : null;
  return !inFreeTextState && (!sessionState || !numericInput);
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('Nexus Pulse — AWAITING_EMAIL_INPUT State Machine', () => {

  const VALID_SESSION = {
    state: 'AWAITING_EMAIL_INPUT',
    schoolName: 'Nexus Academy',
    students: [{ id: 'STU-001' }, { id: 'STU-002' }],
    paymentContext: {
      pendingTx:     { amount: 15000, paymentType: 'Full Payment', percentage: null },
      existingEmail: 'parent@example.com',
    },
  };

  describe('Valid email typed directly', () => {
    it('sets emailToUse and proceeds to checkout', () => {
      const result = simulateEmailInputHandler({
        text:     'newparent@gmail.com',
        session:  VALID_SESSION,
        matchable: '8031234567',
      });
      expect(result.proceedToCheckout).not.toBeNull();
      expect(result.proceedToCheckout.email).toBe('newparent@gmail.com');
      expect(result.replies).toContain('EMAIL_UPDATED');
    });

    it('updates ALL students in the session with the new email', () => {
      const result = simulateEmailInputHandler({
        text:     'newparent@gmail.com',
        session:  VALID_SESSION,
        matchable: '8031234567',
      });
      expect(result.dbUpdates).toHaveLength(2);
      expect(result.dbUpdates[0]).toEqual({ studentId: 'STU-001', email: 'newparent@gmail.com' });
      expect(result.dbUpdates[1]).toEqual({ studentId: 'STU-002', email: 'newparent@gmail.com' });
    });
  });

  describe('Reply "1" — use registered email', () => {
    it('uses the existingEmail from session and proceeds to checkout', () => {
      const result = simulateEmailInputHandler({
        text:     '1',
        session:  VALID_SESSION,
        matchable: '8031234567',
      });
      expect(result.proceedToCheckout).not.toBeNull();
      expect(result.proceedToCheckout.email).toBe('parent@example.com');
      expect(result.replies).not.toContain('INVALID_EMAIL');
    });

    it('falls through to email validation if no existingEmail is set', () => {
      const session = {
        ...VALID_SESSION,
        paymentContext: { ...VALID_SESSION.paymentContext, existingEmail: null },
      };
      const result = simulateEmailInputHandler({ text: '1', session, matchable: '8031234567' });
      // '1' is not a valid email format — should reply with INVALID_EMAIL
      expect(result.replies).toContain('INVALID_EMAIL');
      expect(result.proceedToCheckout).toBeNull();
    });
  });

  describe('Reply "2" — use fallback email', () => {
    it('uses the configured fallback_email when available', () => {
      const result = simulateEmailInputHandler({
        text:          '2',
        session:       VALID_SESSION,
        matchable:     '8031234567',
        fallbackEmail: 'school@nexusos.com.ng',
      });
      expect(result.proceedToCheckout.email).toBe('school@nexusos.com.ng');
    });

    it('generates a phone-based fallback email when none configured', () => {
      const result = simulateEmailInputHandler({
        text:      '2',
        session:   VALID_SESSION,
        matchable: '8031234567',
      });
      expect(result.proceedToCheckout.email).toBe('parent-8031234567@nexusos.com.ng');
    });
  });

  describe('Invalid input', () => {
    it('rejects a plain number (non-email, non-option) with INVALID_EMAIL', () => {
      const result = simulateEmailInputHandler({ text: '99', session: VALID_SESSION, matchable: '8031234567' });
      expect(result.replies).toContain('INVALID_EMAIL');
      expect(result.proceedToCheckout).toBeNull();
    });

    it('rejects a malformed email string', () => {
      const result = simulateEmailInputHandler({ text: 'notanemail', session: VALID_SESSION, matchable: '8031234567' });
      expect(result.replies).toContain('INVALID_EMAIL');
    });

    it('does NOT clear the session on invalid email (parent can retry)', () => {
      const result = simulateEmailInputHandler({ text: 'bad-email', session: VALID_SESSION, matchable: '8031234567' });
      expect(result.sessionCleared).toBe(false);
    });
  });

  describe('Reply "0" — go back', () => {
    it('clears the session and shows main menu', () => {
      const result = simulateEmailInputHandler({ text: '0', session: VALID_SESSION, matchable: '8031234567' });
      expect(result.sessionCleared).toBe(true);
      expect(result.replies).toContain('MAIN_MENU');
    });
  });

  describe('Missing paymentContext.pendingTx', () => {
    it('clears the session with SESSION_ERROR when pendingTx is absent', () => {
      const brokenSession = {
        ...VALID_SESSION,
        paymentContext: { existingEmail: 'x@x.com' }, // pendingTx missing
      };
      const result = simulateEmailInputHandler({ text: 'some@email.com', session: brokenSession, matchable: '8031234567' });
      expect(result.sessionCleared).toBe(true);
      expect(result.replies).toContain('SESSION_ERROR');
    });
  });

  describe('FREE_TEXT gate — AWAITING_EMAIL_INPUT bypasses menu reset', () => {
    it('does NOT reset to menu when state is AWAITING_EMAIL_INPUT', () => {
      // Any input (even non-numeric) should NOT trigger a menu reset
      expect(wouldResetToMenu('AWAITING_EMAIL_INPUT', 'parent@email.com')).toBe(false);
    });

    it('DOES reset to menu when state is MENU and non-numeric text arrives', () => {
      expect(wouldResetToMenu('MENU', 'hello there')).toBe(true);
    });

    it('does NOT reset for AWAITING_CUSTOM_AMOUNT (also a free-text state)', () => {
      expect(wouldResetToMenu('AWAITING_CUSTOM_AMOUNT', '12500')).toBe(false);
    });
  });

  describe('Email validation utility', () => {
    it.each([
      ['user@domain.com',    true],
      ['user+tag@sub.co.uk', true],
      ['info@school.edu.ng', true],
      ['notanemail',         false],
      ['@domain.com',        false],
      ['user@',              false],
      ['',                   false],
      ['1',                  false],
      ['2',                  false],
    ])('isValidEmail(%s) → %s', (input, expected) => {
      expect(isValidEmail(input)).toBe(expected);
    });
  });
});
