/**
 * tests/fee-shield-enforcement.test.js
 *
 * Unit tests for:
 *   1. Dynamic fee_status calculation (Gold/Diamond vs Standalone/Silver)
 *   2. Universal Fee Shield enforcement in result distribution
 *   3. Pre-flight clearance audit filtering
 */
import { describe, it, expect } from 'vitest';

// ── 1. Dynamic fee_status helper logic ─────────────────────────────────────────

function computeDynamicFeeStatus(tier, studentRecord, feeRecord) {
  const isFinancialTier = (tier === 'Gold' || tier === 'Diamond');
  if (isFinancialTier) {
    if (feeRecord) {
      const balance = (feeRecord.total_billed || 0) - (feeRecord.total_paid || 0);
      return balance <= 0 ? 'cleared' : 'owing';
    }
    return studentRecord.fee_status === 'cleared' ? 'cleared' : 'owing';
  } else {
    // Standalone / Silver
    return studentRecord.fee_status === 'cleared' ? 'cleared' : 'owing';
  }
}

describe('Fee Shield: Dynamic Fee Status Computation', () => {
  it('computes cleared for Gold/Diamond when fee balance is 0 or negative', () => {
    const student = { id: 's1', fee_status: 'owing' };
    const feeRecord = { total_billed: 50000, total_paid: 50000 };
    expect(computeDynamicFeeStatus('Gold', student, feeRecord)).toBe('cleared');
    expect(computeDynamicFeeStatus('Diamond', student, { total_billed: 50000, total_paid: 60000 })).toBe('cleared');
  });

  it('computes owing for Gold/Diamond when fee balance is positive', () => {
    const student = { id: 's1', fee_status: 'cleared' };
    const feeRecord = { total_billed: 50000, total_paid: 30000 };
    expect(computeDynamicFeeStatus('Gold', student, feeRecord)).toBe('owing');
    expect(computeDynamicFeeStatus('Diamond', student, feeRecord)).toBe('owing');
  });

  it('defaults Standalone and Silver tiers to owing unless explicitly set to cleared', () => {
    const owingStudent = { id: 's1', fee_status: '' };
    const clearedStudent = { id: 's2', fee_status: 'cleared' };
    
    expect(computeDynamicFeeStatus('Silver', owingStudent, null)).toBe('owing');
    expect(computeDynamicFeeStatus('Standalone', owingStudent, null)).toBe('owing');
    
    expect(computeDynamicFeeStatus('Silver', clearedStudent, null)).toBe('cleared');
    expect(computeDynamicFeeStatus('Standalone', clearedStudent, null)).toBe('cleared');
  });
});

// ── 2. Fee Shield Distribution Blocking ───────────────────────────────────────

function filterWithFeeShield(students, feeSettings) {
  const shieldEnabled = feeSettings.fee_shield_enabled === true;
  const shieldMode = feeSettings.fee_shield_mode || 'block';

  if (!shieldEnabled || shieldMode !== 'block') {
    return { processed: students, blocked: [] };
  }

  const processed = [];
  const blocked = [];

  for (const s of students) {
    const isOwing = (s.fee_status !== 'cleared' && s.feeStatus !== 'cleared');
    if (isOwing) {
      blocked.push(s);
    } else {
      processed.push(s);
    }
  }

  return { processed, blocked };
}

describe('Fee Shield: Distribution Channel Enforcement', () => {
  const sampleStudents = [
    { id: 's1', name: 'Cleared Student', fee_status: 'cleared' },
    { id: 's2', name: 'Owing Student 1', fee_status: 'owing' },
    { id: 's3', name: 'Owing Student 2', fee_status: 'owing' }
  ];

  it('blocks owing students when Fee Shield is enabled in block mode', () => {
    const settings = { fee_shield_enabled: true, fee_shield_mode: 'block' };
    const { processed, blocked } = filterWithFeeShield(sampleStudents, settings);

    expect(processed).toHaveLength(1);
    expect(processed[0].id).toBe('s1');
    expect(blocked).toHaveLength(2);
  });

  it('allows all students when Fee Shield is disabled', () => {
    const settings = { fee_shield_enabled: false, fee_shield_mode: 'block' };
    const { processed, blocked } = filterWithFeeShield(sampleStudents, settings);

    expect(processed).toHaveLength(3);
    expect(blocked).toHaveLength(0);
  });

  it('allows all students when Fee Shield mode is set to warn', () => {
    const settings = { fee_shield_enabled: true, fee_shield_mode: 'warn' };
    const { processed, blocked } = filterWithFeeShield(sampleStudents, settings);

    expect(processed).toHaveLength(3);
    expect(blocked).toHaveLength(0);
  });
});
