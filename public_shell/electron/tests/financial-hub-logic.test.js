/**
 * tests/financial-hub-logic.test.js
 *
 * Isolated logic unit tests for the FinancialHub view logic.
 *
 * Imports directly from the real production module (src/lib/financialUtils.js)
 * to ensure we never have code divergence between the test suite and the actual app.
 *
 * Covered blocks:
 *   A. applyInlineEdit Logic     — roster mapping, merging edits, default value fallback
 *   B. Manual Payment Validator  — amount bounds, non-zero checks, validation triggers
 *   C. Refund Submit Validator   — max refund caps, positive amount guard, reason requirements
 *   D. Settlement settings validation — verified Paystack vs manual bank account config integrity
 *   E. Roster Grid status filter simulation — client-side category mapping logic
 */
import { describe, it, expect } from 'vitest';
import {
  applyInlineEdit,
  validatePaymentInput,
  validateRefundInput,
  validateBankAccounts,
} from '../src/lib/financialUtils.js';

// ─── E. Roster Grid Client Status Filter ─────────────────────────────────────
// Keep as a helper simulator in tests since it's a simple client-side array filter logic.
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

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('A. applyInlineEdit Logic', () => {
  const ROSTER = [
    { student_id: 'STU-01', total_billed: 50000, total_paid: 10000, next_due_date: '2026-07-15' },
    { student_id: 'STU-02', total_billed: 60000, total_paid: 30000, next_due_date: '2026-07-20' },
  ];

  it('adds a new pending edit correctly', () => {
    const prev = {};
    const result = applyInlineEdit({
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
    const result = applyInlineEdit({
      sid: 'STU-02', field: 'next_due_date', val: '2026-08-01', roster: ROSTER, prevEdits: prev
    });
    expect(result['STU-02'].next_due_date).toBe('2026-08-01');
    expect(result['STU-02'].total_billed).toBe(60000);
  });

  it('parses invalid numbers to 0 fallback', () => {
    const prev = {};
    const result = applyInlineEdit({
      sid: 'STU-01', field: 'total_billed', val: 'abc_not_numeric', roster: ROSTER, prevEdits: prev
    });
    expect(result['STU-01'].total_billed).toBe(0);
  });

  it('maintains non-target student pending edits on changes', () => {
    const prev = {
      'STU-02': { total_billed: 70000, total_paid: 30000, next_due_date: '2026-07-20' }
    };
    const result = applyInlineEdit({
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

  it.each(['0', '-1000', '', 'invalid_num'])(
    'rejects invalid payment amount "%s"',
    (amt) => {
      const result = validatePaymentInput(STUDENT, amt, 'cash', '');
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/must be a positive number/);
    }
  );

  it.each(['transfer', 'pos'])(
    'rejects payment method "%s" when reference number is missing or blank',
    (method) => {
      const result = validatePaymentInput(STUDENT, '15000', method, '   ');
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/Reference number is required/);
    }
  );

  it('accepts valid payment parameters', () => {
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

  it.each(['0', '-5000', '', 'invalid_num'])(
    'rejects invalid refund amount "%s"',
    (amt) => {
      const result = validateRefundInput(TARGET, amt, 'Double charge');
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/greater than zero/);
    }
  );

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
  it('rejects verified Paystack account with empty bank code', () => {
    const accounts = [
      { paystack_verified: true, bank_code: '', number: '1234567890', name: 'John Doe' }
    ];
    expect(validateBankAccounts(accounts).ok).toBe(false);
  });

  it('rejects verified Paystack account with invalid number length', () => {
    const badLength = [
      { paystack_verified: true, bank_code: '058', number: '12345', name: 'John Doe' }
    ];
    expect(validateBankAccounts(badLength).ok).toBe(false);
  });

  it.each(['Resolving...', 'Verification failed'])(
    'rejects verified Paystack account when name is a placeholder "%s"',
    (placeholderName) => {
      const accounts = [
        { paystack_verified: true, bank_code: '058', number: '1234567890', name: placeholderName }
      ];
      expect(validateBankAccounts(accounts).ok).toBe(false);
    }
  );

  it('rejects manual account with missing fields when any other field is filled', () => {
    const incomplete = [
      { paystack_verified: false, bank: '', number: '1234567890', name: 'James Doe' }
    ];
    expect(validateBankAccounts(incomplete).ok).toBe(false);
  });

  it('accepts completely clean verified or manual account lists', () => {
    const good = [
      { paystack_verified: true, bank_code: '058', number: '1234567890', name: 'Acme School Inc' },
      { paystack_verified: false, bank: 'Zenith', number: '0987654321', name: 'Acme Manual Account' }
    ];
    expect(validateBankAccounts(good).ok).toBe(true);
  });

  it('ignores empty manual account lines safely', () => {
    const emptyManual = [
      { paystack_verified: false, bank: '', number: '', name: '' }
    ];
    expect(validateBankAccounts(emptyManual).ok).toBe(true);
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
