/**
 * src/lib/financialUtils.js
 *
 * Pure validation and state-transform utilities extracted from FinancialHub.tsx.
 * These functions have no React or Electron dependencies — they are the single
 * source of truth shared by both the component and the test suite, guaranteeing
 * that tests always exercise the real production validation logic.
 */

/**
 * Applies a single inline-edit keystroke to the pending-edits map for the fee roster.
 * Numeric fields are coerced with (Number(val) || 0); the date field is stored as-is.
 *
 * @param {{ sid: string, field: string, val: string, roster: Array, prevEdits: Object }} params
 * @returns {Object} New pendingEdits map
 */
export function applyInlineEdit({ sid, field, val, roster, prevEdits }) {
  const base = roster.find(r => r.student_id === sid) || { total_billed: 0, total_paid: 0, next_due_date: '' };
  const cur  = prevEdits[sid] || {
    total_billed:  base.total_billed,
    total_paid:    base.total_paid,
    next_due_date: base.next_due_date,
  };
  return {
    ...prevEdits,
    [sid]: {
      ...cur,
      [field]: field === 'next_due_date' ? val : (Number(val) || 0),
    },
  };
}

/**
 * Validates the inputs of the manual payment recording form.
 *
 * @param {Object|null} payStudent  - Selected student object
 * @param {string}      payAmount   - Raw string from the amount input
 * @param {string}      payMethod   - 'cash' | 'transfer' | 'pos' | 'cheque'
 * @param {string}      payRef      - Reference number (required for transfer / POS)
 * @returns {{ ok: boolean, error?: string }}
 */
export function validatePaymentInput(payStudent, payAmount, payMethod, payRef) {
  if (!payStudent) {
    return { ok: false, error: 'Select a student before logging a payment.' };
  }
  if (!payAmount || isNaN(Number(payAmount)) || Number(payAmount) <= 0) {
    return { ok: false, error: 'Payment amount must be a positive number.' };
  }
  if ((payMethod === 'transfer' || payMethod === 'pos') && (!payRef || !payRef.trim())) {
    return { ok: false, error: 'Reference number is required for bank transfer or POS payments.' };
  }
  return { ok: true };
}

/**
 * Validates the inputs of the refund initiation form.
 *
 * @param {{ studentId: string, txRef: string, maxAmount: number }|null} refundTarget
 * @param {string} refundAmt    - Raw string from the amount input
 * @param {string} refundReason - Mandatory reason text
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateRefundInput(refundTarget, refundAmt, refundReason) {
  if (!refundTarget) {
    return { ok: false, error: 'No transaction selected for refund.' };
  }
  if (!refundAmt || isNaN(Number(refundAmt)) || Number(refundAmt) <= 0) {
    return { ok: false, error: 'Refund amount must be greater than zero.' };
  }
  if (!refundReason || !refundReason.trim()) {
    return { ok: false, error: 'A mandatory reason is required for processing refunds.' };
  }
  if (Number(refundAmt) > refundTarget.maxAmount) {
    return {
      ok: false,
      error: `Refund amount cannot exceed ₦${refundTarget.maxAmount.toLocaleString('en-NG')}`,
    };
  }
  return { ok: true };
}

/**
 * Validates bank settlement accounts before saving Financial Settings.
 * Handles both Paystack-verified and manually-entered account entries.
 *
 * @param {Array} bankAccounts
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateBankAccounts(bankAccounts) {
  for (const acc of bankAccounts) {
    if (acc.paystack_verified) {
      if (
        !acc.bank_code ||
        !acc.number ||
        acc.number.length !== 10 ||
        !acc.name ||
        acc.name === 'Resolving...' ||
        acc.name === 'Verification failed'
      ) {
        return { ok: false, error: 'Please resolve all Paystack accounts correctly.' };
      }
    } else {
      const bank = (acc.bank || '').trim();
      const num  = (acc.number || '').trim();
      const name = (acc.name || '').trim();
      if (bank || num || name) {
        if (!bank || num.length !== 10 || !name) {
          return { ok: false, error: 'Manual accounts must have name, bank, and 10-digit number.' };
        }
      }
    }
  }
  return { ok: true };
}
