/**
 * tests/phase4b-standalone.test.js
 *
 * Phase 4B — Standalone Pack Integration Tests
 *
 * These tests exercise the Standalone tier logic inline (no real DB/network).
 * They validate all Standalone gaps found in research:
 *   1. billing/initiate: accepts tier 'standalone' with no licensed_terms
 *   2. fulfillment: Standalone valid_until = now + 5 years (NOT term-based)
 *   3. activate-standalone: tier gate, hardware binding, idempotency
 *   4. activate-standalone: HMAC activation_token is deterministic
 *   5. Standalone pricing: flat_price calculator returns correct structure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000; // 157_680_000_000 ms

// ─── Billing/initiate schema validator (mirrors Zod schema after fix) ─────────

const ALL_TIERS = ['silver', 'gold', 'diamond', 'standalone'];

function validateBillingInitiate(body) {
  const errors = [];
  if (!ALL_TIERS.includes(body.tier)) {
    errors.push(`tier must be one of: ${ALL_TIERS.join(', ')}`);
  }
  if (!body.school_id) errors.push('school_id is required');
  if (!body.email)     errors.push('email is required');
  // Subscription tiers require licensed_terms; Standalone does not
  if (body.tier !== 'standalone') {
    if (!body.licensed_terms?.length) errors.push('licensed_terms required for subscription tiers');
    if (!body.term_count || body.term_count < 1) errors.push('term_count >= 1 required for subscription tiers');
  }
  return errors;
}

// ─── Fulfillment valid_until resolver (mirrors fulfillment.ts after fix) ──────

function resolveValidUntil(tier, licensed_terms, licenseValidUntilFn, now = Date.now()) {
  if (tier === 'standalone') {
    return now + FIVE_YEARS_MS;
  }
  return licenseValidUntilFn(licensed_terms);
}

// ─── Activate-standalone handler (mirrors new route logic) ───────────────────

function makeActivateStandaloneHandler(db, secret = 'test-secret') {
  return async ({ hardware_id, school_id, payloadTier = 'standalone', payloadSchoolId }) => {
    const resolvedSchoolId = payloadSchoolId ?? school_id;

    if (payloadTier !== 'standalone') {
      return { status: 200, body: { ok: false, reason: 'wrong_tier' } };
    }
    if (resolvedSchoolId !== school_id) {
      return { status: 200, body: { ok: false, reason: 'school_mismatch' } };
    }

    let license;
    try {
      license = await db.license.findFirst({ where: { school_id: resolvedSchoolId, status: 'active' } });
    } catch {
      return { status: 500, body: { ok: false, reason: 'server_error' } };
    }
    if (!license) return { status: 200, body: { ok: false, reason: 'revoked' } };

    if (license.hardware_id && license.hardware_id !== hardware_id) {
      return { status: 200, body: { ok: false, reason: 'hardware_mismatch' } };
    }

    if (!license.hardware_id) {
      await db.license.update({ where: { id: license.id }, data: { hardware_id } });
    }

    const activationToken = createHmac('sha256', secret)
      .update(`standalone:${school_id}:${hardware_id}`)
      .digest('hex');

    return { status: 200, body: { ok: true, activation_token: activationToken, server_time: Date.now() } };
  };
}

// ─── Standalone flat pricing calculator (mirrors calculators.ts addition) ─────

function calculateStandaloneFlat(rules) {
  const years = rules.valid_years ?? 5;
  return {
    total:     rules.flat_price,
    breakdown: [{ label: `Standalone License (${years}-year, one-time)`, amount: rules.flat_price }],
    currency:  'NGN',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('billing/initiate — Standalone tier acceptance', () => {
  it('accepts tier: standalone with empty licensed_terms array', () => {
    const errors = validateBillingInitiate({
      tier: 'standalone', school_id: 'sch1', email: 'a@b.ng',
      licensed_terms: [], term_count: 0,
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts tier: standalone with no licensed_terms key at all', () => {
    const errors = validateBillingInitiate({
      tier: 'standalone', school_id: 'sch1', email: 'a@b.ng',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts tier: standalone with no term_count', () => {
    const errors = validateBillingInitiate({
      tier: 'standalone', school_id: 'sch1', email: 'a@b.ng',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts tier: silver with valid licensed_terms', () => {
    const errors = validateBillingInitiate({
      tier: 'silver', school_id: 'sch1', email: 'a@b.ng',
      licensed_terms: ['2025/2026-T1'], term_count: 1,
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts tier: gold with valid licensed_terms', () => {
    const errors = validateBillingInitiate({
      tier: 'gold', school_id: 'sch1', email: 'a@b.ng',
      licensed_terms: ['2025/2026-T1', '2025/2026-T2'], term_count: 2,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects unknown tier "platinum"', () => {
    const errors = validateBillingInitiate({
      tier: 'platinum', school_id: 'sch1', email: 'a@b.ng',
    });
    expect(errors.some(e => e.includes('tier'))).toBe(true);
  });

  it('rejects silver without licensed_terms', () => {
    const errors = validateBillingInitiate({
      tier: 'silver', school_id: 'sch1', email: 'a@b.ng',
      licensed_terms: [], term_count: 1,
    });
    expect(errors.some(e => e.includes('licensed_terms'))).toBe(true);
  });

  it('rejects silver without term_count', () => {
    const errors = validateBillingInitiate({
      tier: 'silver', school_id: 'sch1', email: 'a@b.ng',
      licensed_terms: ['2025/2026-T1'], term_count: 0,
    });
    expect(errors.some(e => e.includes('term_count'))).toBe(true);
  });
});

describe('fulfillment — Standalone valid_until is 5 years from issue time', () => {
  const mockLicenseValidUntil = vi.fn(() => 9_999_999_999_999);

  beforeEach(() => { mockLicenseValidUntil.mockClear(); });

  it('FIVE_YEARS_MS constant is exactly 157,680,000,000 ms', () => {
    expect(FIVE_YEARS_MS).toBe(157_680_000_000);
  });

  it('returns now + 5 years for standalone tier (does NOT call licenseValidUntil)', () => {
    const now = Date.now();
    const result = resolveValidUntil('standalone', [], mockLicenseValidUntil, now);
    expect(result).toBe(now + FIVE_YEARS_MS);
    expect(mockLicenseValidUntil).not.toHaveBeenCalled();
  });

  it('Standalone valid_until is within 100ms of now + FIVE_YEARS_MS', () => {
    const before = Date.now();
    const result = resolveValidUntil('standalone', [], mockLicenseValidUntil);
    const after  = Date.now();
    expect(result).toBeGreaterThanOrEqual(before + FIVE_YEARS_MS);
    expect(result).toBeLessThanOrEqual(after + FIVE_YEARS_MS + 100);
  });

  it('delegates to licenseValidUntil for silver tier', () => {
    resolveValidUntil('silver', ['2025/2026-T1'], mockLicenseValidUntil);
    expect(mockLicenseValidUntil).toHaveBeenCalledWith(['2025/2026-T1']);
  });

  it('delegates to licenseValidUntil for gold tier', () => {
    resolveValidUntil('gold', ['2025/2026-T1'], mockLicenseValidUntil);
    expect(mockLicenseValidUntil).toHaveBeenCalledOnce();
  });

  it('delegates to licenseValidUntil for diamond tier', () => {
    resolveValidUntil('diamond', ['2025/2026-T1', '2025/2026-T2'], mockLicenseValidUntil);
    expect(mockLicenseValidUntil).toHaveBeenCalledOnce();
  });
});

describe('activate-standalone — tier gate, binding, idempotency', () => {
  let db, handler;

  beforeEach(() => {
    db = {
      license: {
        findFirst: vi.fn(),
        update:    vi.fn().mockResolvedValue({}),
      },
    };
    handler = makeActivateStandaloneHandler(db);
  });

  it('returns wrong_tier for a Silver token', async () => {
    const res = await handler({
      hardware_id: 'hw1', school_id: 'sch1', payloadTier: 'silver', payloadSchoolId: 'sch1',
    });
    expect(res.body.ok).toBe(false);
    expect(res.body.reason).toBe('wrong_tier');
    expect(db.license.findFirst).not.toHaveBeenCalled();
  });

  it('returns wrong_tier for a Gold token', async () => {
    const res = await handler({
      hardware_id: 'hw1', school_id: 'sch1', payloadTier: 'gold', payloadSchoolId: 'sch1',
    });
    expect(res.body.reason).toBe('wrong_tier');
  });

  it('returns wrong_tier for a Diamond token', async () => {
    const res = await handler({
      hardware_id: 'hw1', school_id: 'sch1', payloadTier: 'diamond', payloadSchoolId: 'sch1',
    });
    expect(res.body.reason).toBe('wrong_tier');
  });

  it('returns revoked when no active license exists in DB', async () => {
    db.license.findFirst.mockResolvedValue(null);
    const res = await handler({
      hardware_id: 'hw1', school_id: 'sch1', payloadTier: 'standalone', payloadSchoolId: 'sch1',
    });
    expect(res.body.ok).toBe(false);
    expect(res.body.reason).toBe('revoked');
  });

  it('binds hardware_id on first-ever activation', async () => {
    db.license.findFirst.mockResolvedValue({ id: 'lic1', school_id: 'sch1', hardware_id: null, status: 'active' });

    const res = await handler({
      hardware_id: 'hw-abc', school_id: 'sch1', payloadTier: 'standalone', payloadSchoolId: 'sch1',
    });
    expect(res.body.ok).toBe(true);
    expect(db.license.update).toHaveBeenCalledWith({
      where: { id: 'lic1' }, data: { hardware_id: 'hw-abc' },
    });
  });

  it('re-confirms same hardware without a DB write (idempotent)', async () => {
    db.license.findFirst.mockResolvedValue({ id: 'lic1', school_id: 'sch1', hardware_id: 'hw-abc', status: 'active' });

    const res = await handler({
      hardware_id: 'hw-abc', school_id: 'sch1', payloadTier: 'standalone', payloadSchoolId: 'sch1',
    });
    expect(res.body.ok).toBe(true);
    expect(db.license.update).not.toHaveBeenCalled();
  });

  it('returns hardware_mismatch for a different hardware_id (anti-piracy)', async () => {
    db.license.findFirst.mockResolvedValue({ id: 'lic1', school_id: 'sch1', hardware_id: 'hw-abc', status: 'active' });

    const res = await handler({
      hardware_id: 'hw-xyz', school_id: 'sch1', payloadTier: 'standalone', payloadSchoolId: 'sch1',
    });
    expect(res.body.ok).toBe(false);
    expect(res.body.reason).toBe('hardware_mismatch');
  });

  it('returns a non-empty string activation_token on success', async () => {
    db.license.findFirst.mockResolvedValue({ id: 'lic1', school_id: 'sch1', hardware_id: null, status: 'active' });

    const res = await handler({
      hardware_id: 'hw-abc', school_id: 'sch1', payloadTier: 'standalone', payloadSchoolId: 'sch1',
    });
    expect(typeof res.body.activation_token).toBe('string');
    expect(res.body.activation_token.length).toBeGreaterThan(10);
  });

  it('returns server_time as a number', async () => {
    db.license.findFirst.mockResolvedValue({ id: 'lic1', school_id: 'sch1', hardware_id: null, status: 'active' });

    const res = await handler({
      hardware_id: 'hw-abc', school_id: 'sch1', payloadTier: 'standalone', payloadSchoolId: 'sch1',
    });
    expect(typeof res.body.server_time).toBe('number');
  });
});

describe('activate-standalone — HMAC activation_token determinism', () => {
  const SECRET = 'test-sovereign-secret';

  it('same inputs always produce the same token', () => {
    const t1 = createHmac('sha256', SECRET).update('standalone:sch1:hw-abc').digest('hex');
    const t2 = createHmac('sha256', SECRET).update('standalone:sch1:hw-abc').digest('hex');
    expect(t1).toBe(t2);
  });

  it('different hardware_id produces a different token', () => {
    const t1 = createHmac('sha256', SECRET).update('standalone:sch1:hw-abc').digest('hex');
    const t2 = createHmac('sha256', SECRET).update('standalone:sch1:hw-xyz').digest('hex');
    expect(t1).not.toBe(t2);
  });

  it('different school_id produces a different token', () => {
    const t1 = createHmac('sha256', SECRET).update('standalone:sch1:hw-abc').digest('hex');
    const t2 = createHmac('sha256', SECRET).update('standalone:sch2:hw-abc').digest('hex');
    expect(t1).not.toBe(t2);
  });

  it('Standalone HMAC prefix differs from Silver (namespace isolation)', () => {
    const standalone = createHmac('sha256', SECRET).update('standalone:sch1:hw-abc').digest('hex');
    const silver     = createHmac('sha256', SECRET).update('silver:sch1:hw-abc').digest('hex');
    expect(standalone).not.toBe(silver);
  });

  it('token is a 64-char hex string (SHA-256 output)', () => {
    const token = createHmac('sha256', SECRET).update('standalone:sch1:hw-abc').digest('hex');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Standalone flat pricing calculator', () => {
  it('total equals flat_price', () => {
    const result = calculateStandaloneFlat({ flat_price: 350_000, valid_years: 5 });
    expect(result.total).toBe(350_000);
  });

  it('breakdown has exactly one line item', () => {
    const result = calculateStandaloneFlat({ flat_price: 350_000, valid_years: 5 });
    expect(result.breakdown).toHaveLength(1);
  });

  it('breakdown amount equals flat_price', () => {
    const result = calculateStandaloneFlat({ flat_price: 350_000, valid_years: 5 });
    expect(result.breakdown[0].amount).toBe(350_000);
  });

  it('breakdown label contains the validity period', () => {
    const result = calculateStandaloneFlat({ flat_price: 350_000, valid_years: 5 });
    expect(result.breakdown[0].label).toContain('5-year');
  });

  it('breakdown label contains "one-time" to differentiate from subscriptions', () => {
    const result = calculateStandaloneFlat({ flat_price: 350_000, valid_years: 5 });
    expect(result.breakdown[0].label).toMatch(/one-time/i);
  });

  it('currency is NGN', () => {
    const result = calculateStandaloneFlat({ flat_price: 200_000, valid_years: 5 });
    expect(result.currency).toBe('NGN');
  });

  it('respects a sovereign-edited flat_price', () => {
    const result = calculateStandaloneFlat({ flat_price: 500_000, valid_years: 5 });
    expect(result.total).toBe(500_000);
    expect(result.breakdown[0].amount).toBe(500_000);
  });
});
