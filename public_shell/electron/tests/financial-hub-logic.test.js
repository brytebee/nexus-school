/**
 * tests/financial-hub-logic.test.js
 *
 * Isolated logic unit tests for the FinancialHub view logic (FinancialHub.tsx).
 *
 * Mirrors the successful test pattern established in tests/nexus-pulse-logic.test.js.
 * This guarantees testing of complex handlers, validators, and state mergers in isolation
 * without loading React components, DOM elements, or Electron APIs.
 *
 * Covered blocks:
 *   A. handleInlineChange Logic  — roster mapping, merging edits, default value fallback
 *   B. Manual Payment Validator  — amount bounds, non-zero checks, validation triggers
 *   C. Refund Submit Validator   — max refund caps, positive amount guard, reason requirements
 *   D. Settlement settings validation — verified Paystack vs manual bank account config integrity
 *   E. Roster Grid status filter simulation — client-side category mapping logic
 */
import { describe, it, expect } from 'vitest';

// ─── A. handleInlineChange Logic ──────────────────────────────────────────────
// Pure implementation mirroring lines 702-708 in FinancialHub.tsx
function simulateInlineChange({ sid, field, val, roster, prevEdits }) {
  const base = roster.find(r => r.student_id === sid) || { total_billed: 0, total_paid: 0, next_due_date: '' };
  const cur  = prevEdits[sid] || { total_billed: base.total_billed, total_paid: base.total_paid, next_due_date: base.next_due_date };
  
  return {
    ...prevEdits,
    [sid]: {
      ...cur,
      [field]: field === 'next_due_date' ? val : (Number(val) || 0)
    }
  };
}

// ─── B. Manual Payment Input Validator ───────────────────────────────────────
// Pure validator mirroring handlePaymentSubmit checks (lines 1268-1269)
function validatePaymentInput(payStudent, payAmount, payMethod, payRef) {
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

// ─── C. Refund Input Validator ───────────────────────────────────────────────
// Pure validator mirroring handleRefundSubmit checks (lines 1330-1345)
function validateRefundInput(refundTarget, refundAmt, refundReason) {
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
      error: `Refund amount cannot exceed ₦${refundTarget.maxAmount.toLocaleString('en-NG')}`
    };
  }
  return { ok: true };
}

// ─── D. Settings Settlement Accounts Validator ──────────────────────────────
// Pure validator mirroring handleSaveSettings checks (lines 1172-1207)
function validateSettingsBankAccounts(bankAccounts) {
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
      // Manual account validation
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

// ─── E. Roster Grid Client Status Filter ─────────────────────────────────────
// Simulates filtering rows in the UI matching logic
function simulateRosterFilter(rows, filter) {
  if (filter === 'all') return rows;
  return rows.filter(row => {
    const outstanding = row.total_billed - row.total_paid;
    if (filter === 'unpaid') return row.total_paid === 0 && outstanding > 0;
    if (filter === 'partial') return row.total_paid > 0 && outstanding > 0;
    if (filter === 'cleared') return outstanding <= 0;
    return true;
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('A. handleInlineChange Logic', () => {
  const ROSTER = [
    { student_id: 'STU-01', total_billed: 50000, total_paid: 10000, next_due_date: '2026-07-15' },
    { student_id: 'STU-02', total_billed: 60000, total_paid: 30000, next_due_date: '2026-07-20' },
  ];

  it('adds a new pending edit correctly', () => {
    const prev = {};
    const result = simulateInlineChange({
      sid: 'STU-01', field: 'total_billed', val: '55000', roster: ROSTER, prevEdits: prev
    });
    expect(result['STU-01']).toEqual({
      total_billed: 55000,
      total_paid: 10000,
      next_due_date: '2026-07-15'
    });
  });

  it('updates next_due_date text field directly', () => {
    const prev = {};
    const result = simulateInlineChange({
      sid: 'STU-02', field: 'next_due_date', val: '2026-08-01', roster: ROSTER, prevEdits: prev
    });
    expect(result['STU-02'].next_due_date).toBe('2026-08-01');
    expect(result['STU-02'].total_billed).toBe(60000);
  });

  it('parses invalid numbers to 0 fallback', () => {
    const prev = {};
    const result = simulateInlineChange({
      sid: 'STU-01', field: 'total_billed', val: 'abc_not_numeric', roster: ROSTER, prevEdits: prev
    });
    expect(result['STU-01'].total_billed).toBe(0);
  });

  it('maintains non-target student pending edits on changes', () => {
    const prev = {
      'STU-02': { total_billed: 70000, total_paid: 30000, next_due_date: '2026-07-20' }
    };
    const result = simulateInlineChange({
      sid: 'STU-01', field: 'total_billed', val: '45000', roster: ROSTER, prevEdits: prev
    });
    expect(result['STU-02'].total_billed).toBe(70000); // unaffected
    expect(result['STU-01'].total_billed).toBe(45000);
  });
});

describe('B. Manual Payment Input Validator', () => {
  const STUDENT = { id: 'STU-01', name: 'James Obi' };

  it('rejects when student is null', () => {
    const result = validatePaymentInput(null, '15000', 'cash', '');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Select a student/);
  });

  it('rejects when amount is negative, zero or empty', () => {
    expect(validatePaymentInput(STUDENT, '0', 'cash', '').ok).toBe(false);
    expect(validatePaymentInput(STUDENT, '-1000', 'cash', '').ok).toBe(false);
    expect(validatePaymentInput(STUDENT, '', 'cash', '').ok).toBe(false);
    expect(validatePaymentInput(STUDENT, 'invalid_num', 'cash', '').ok).toBe(false);
  });

  it('rejects bank transfer / POS payments when reference number is missing', () => {
    expect(validatePaymentInput(STUDENT, '15000', 'transfer', '').ok).toBe(false);
    expect(validatePaymentInput(STUDENT, '15000', 'pos', '   ').ok).toBe(false);
  });

  it('accepts correct payment input parameters', () => {
    expect(validatePaymentInput(STUDENT, '25000', 'cash', '').ok).toBe(true);
    expect(validatePaymentInput(STUDENT, '25000', 'transfer', 'TX-REF-100').ok).toBe(true);
  });
});

describe('C. Refund Input Validator', () => {
  const TARGET = { studentId: 'STU-01', txRef: 'PAY-1', maxAmount: 20000 };

  it('rejects when refund target is missing', () => {
    const result = validateRefundInput(null, '10000', 'Double charge');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No transaction selected/);
  });

  it('rejects when refund amount is invalid or non-positive', () => {
    expect(validateRefundInput(TARGET, '0', 'test').ok).toBe(false);
    expect(validateRefundInput(TARGET, '-5000', 'test').ok).toBe(false);
    expect(validateRefundInput(TARGET, '', 'test').ok).toBe(false);
  });

  it('rejects when refund reason is empty or whitespace', () => {
    const result = validateRefundInput(TARGET, '5000', '   ');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/mandatory reason/);
  });

  it('rejects when refund amount exceeds max refundable transaction amount', () => {
    const result = validateRefundInput(TARGET, '25000', 'Refund all');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exceed ₦20,000/);
  });

  it('accepts valid refund parameters', () => {
    expect(validateRefundInput(TARGET, '15000', 'Legit refund').ok).toBe(true);
    expect(validateRefundInput(TARGET, '20000', 'Full refund').ok).toBe(true);
  });
});

describe('D. Settings Settlement Accounts Validator', () => {
  it('rejects verified Paystack account with empty bank code or invalid length number', () => {
    const accounts = [
      { paystack_verified: true, bank_code: '', number: '1234567890', name: 'John Doe' }
    ];
    expect(validateSettingsBankAccounts(accounts).ok).toBe(false);

    const badLength = [
      { paystack_verified: true, bank_code: '058', number: '12345', name: 'John Doe' }
    ];
    expect(validateSettingsBankAccounts(badLength).ok).toBe(false);
  });

  it('rejects verified Paystack account with resolver placeholder names', () => {
    const placeholder = [
      { paystack_verified: true, bank_code: '058', number: '1234567890', name: 'Resolving...' }
    ];
    expect(validateSettingsBankAccounts(placeholder).ok).toBe(false);
  });

  it('rejects manual account with missing bank/name when number is specified', () => {
    const incomplete = [
      { paystack_verified: false, bank: '', number: '1234567890', name: 'James Doe' }
    ];
    expect(validateSettingsBankAccounts(incomplete).ok).toBe(false);
  });

  it('accepts completely clean verified or manual account lists', () => {
    const good = [
      { paystack_verified: true, bank_code: '058', number: '1234567890', name: 'Acme School Inc' },
      { paystack_verified: false, bank: 'Zenith', number: '0987654321', name: 'Acme Manual Account' }
    ];
    expect(validateSettingsBankAccounts(good).ok).toBe(true);
  });

  it('ignores empty manual account lines safely', () => {
    const emptyManual = [
      { paystack_verified: false, bank: '', number: '', name: '' }
    ];
    expect(validateSettingsBankAccounts(emptyManual).ok).toBe(true);
  });
});

describe('E. Roster Grid Client Status Filter Simulation', () => {
  const ROWS = [
    { student_id: '1', total_billed: 50000, total_paid: 50000 }, // cleared
    { student_id: '2', total_billed: 50000, total_paid: 20000 }, // partial
    { student_id: '3', total_billed: 50000, total_paid: 0 },     // unpaid
    { student_id: '4', total_billed: 0,     total_paid: 0 },     // no bill (unpaid, or not billed)
  ];

  it('returns all rows for "all" filter', () => {
    expect(simulateRosterFilter(ROWS, 'all')).toHaveLength(4);
  });

  it('filters unpaid rows correctly (paid is 0, billed > 0)', () => {
    const result = simulateRosterFilter(ROWS, 'unpaid');
    expect(result).toHaveLength(1);
    expect(result[0].student_id).toBe('3');
  });

  it('filters partial rows correctly (paid > 0, billed > paid)', () => {
    const result = simulateRosterFilter(ROWS, 'partial');
    expect(result).toHaveLength(1);
    expect(result[0].student_id).toBe('2');
  });

  it('filters cleared rows correctly (billed <= paid)', () => {
    const result = simulateRosterFilter(ROWS, 'cleared');
    expect(result).toHaveLength(2); // row 1 (50k/50k) and row 4 (0/0)
    expect(result.map(r => r.student_id)).toEqual(['1', '4']);
  });
});
