/**
 * seat-cap.test.js
 *
 * ⚠️  F3 (September 2026): The per-student seat cap and overflow tagging system
 *     has been REMOVED.  All quota enforcement is now a no-op:
 *
 *       assertQuotaCompliant()  → always null
 *       recheckQuota()          → always overQuota=false, quotaEnforced=false
 *       add-student-form        → always inserts as enrollment_status='active'
 *
 *     These tests document the NEW invariants.
 *     The deleted enforcement logic can be found in git history prior to c24889a.
 */
import { describe, it, expect } from 'vitest';

const GATED_FEATURES = [
  'generate-reports', 'results:dispatch', 'results:publish',
  'fees:record-payment', 'fees:upsert', 'cbt:deploy-exam',
  'cbt:create-batch', 'cbt:dispatch-pulse-notifications',
];

/** F3: gate removed — always null */
function assertQuotaCompliant(_channel, _licenseStatus) {
  return null;
}

/** F3: cap removed — always overQuota=false, quotaEnforced=false */
function recheckQuota(licenseStatus) {
  return { ...(licenseStatus ?? {}), overQuota: false, quotaEnforced: false };
}

/** F3: always inserts as active, no cap check */
function addStudentCheck(students, { id, name, class_name }) {
  students.set(id, { id, name, class_name, enrollment_status: 'active' });
  return { ok: true };
}

/** F3: simplified get-count — no cap in response */
function getStudentCount(n) { return { ok: true, count: n }; }

// ─── assertQuotaCompliant ─────────────────────────────────────────────────────

describe('assertQuotaCompliant — F3: always returns null', () => {
  it('returns null for every previously gated feature when quotaEnforced=true', () => {
    const lic = { quotaEnforced: true, overQuota: true, student_count: 81, enrolledCount: 150 };
    GATED_FEATURES.forEach(ch => expect(assertQuotaCompliant(ch, lic)).toBeNull());
  });

  it('returns null for non-gated features', () => {
    expect(assertQuotaCompliant('get-all-students', { quotaEnforced: true })).toBeNull();
  });

  it('returns null when licenseStatus is null', () => {
    expect(assertQuotaCompliant('generate-reports', null)).toBeNull();
  });

  it('returns null when licenseStatus is undefined', () => {
    expect(assertQuotaCompliant('fees:upsert', undefined)).toBeNull();
  });
});

// ─── recheckQuota ─────────────────────────────────────────────────────────────

describe('recheckQuota — F3: always neutralises quota flags', () => {
  it('overQuota=false even when enrolled far exceeds old cap', () => {
    const r = recheckQuota({ student_count: 50, enrolledCount: 9999 });
    expect(r.overQuota).toBe(false);
    expect(r.quotaEnforced).toBe(false);
  });

  it('overrides quotaEnforced=true and overQuota=true coming in', () => {
    const r = recheckQuota({ quotaEnforced: true, overQuota: true });
    expect(r.overQuota).toBe(false);
    expect(r.quotaEnforced).toBe(false);
  });

  it('preserves unrelated license fields (tier, expires_at, etc.)', () => {
    const r = recheckQuota({ tier: 'Gold', expires_at: 9999999, licensed_terms: ['2024/2025-T3'] });
    expect(r.tier).toBe('Gold');
    expect(r.expires_at).toBe(9999999);
    expect(r.licensed_terms).toEqual(['2024/2025-T3']);
  });

  it('works with null input', () => {
    const r = recheckQuota(null);
    expect(r.overQuota).toBe(false);
    expect(r.quotaEnforced).toBe(false);
  });
});

// ─── add-student-form ─────────────────────────────────────────────────────────

describe('add-student-form — F3: no seat cap enforcement', () => {
  it('inserts student as enrollment_status="active"', () => {
    const students = new Map();
    const r = addStudentCheck(students, { id: 'S1', name: 'Ada', class_name: 'JSS 1' });
    expect(r.ok).toBe(true);
    expect(students.get('S1').enrollment_status).toBe('active');
  });

  it('succeeds regardless of existing student count (no cap block)', () => {
    const students = new Map();
    for (let i = 0; i < 1000; i++) students.set(`e${i}`, { enrollment_status: 'active' });
    const r = addStudentCheck(students, { id: 'LATE', name: 'Late Joiner', class_name: 'SS 3' });
    expect(r.ok).toBe(true);
    expect(students.get('LATE').enrollment_status).toBe('active');
  });

  it('never produces enrollment_status="overflow"', () => {
    const students = new Map();
    for (let i = 0; i < 5; i++) addStudentCheck(students, { id: `S${i}`, name: `S${i}`, class_name: 'JSS 2' });
    for (const s of students.values()) expect(s.enrollment_status).not.toBe('overflow');
  });
});

// ─── students:get-count ───────────────────────────────────────────────────────

describe('students:get-count — F3: count-only, no cap field in response', () => {
  it('returns ok=true and a count', () => {
    const r = getStudentCount(42);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(42);
  });

  it('does NOT include a cap field', () => {
    expect(getStudentCount(10).cap).toBeUndefined();
  });

  it('does NOT include willExceed or skippedCount', () => {
    expect(getStudentCount(10).willExceed).toBeUndefined();
    expect(getStudentCount(10).skippedCount).toBeUndefined();
  });
});
