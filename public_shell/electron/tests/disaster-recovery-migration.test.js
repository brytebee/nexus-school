/**
 * tests/disaster-recovery-migration.test.js
 *
 * Disaster Recovery & Machine Re-bind Integration Tests
 *
 * Tests the migration pin verification, hardware re-binding, 48-hour expiration
 * enforcement, single-use PIN consumption, and local activation state updates.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

// ─── Pure Business Logic Mirrors ──────────────────────────────────────────────

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

function rebindNode(license, { reason }) {
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + FORTY_EIGHT_HOURS_MS);

  license.hardware_id = null;
  license.activated_at = null;
  license.migration_pin = pin;
  license.migration_pin_expires_at = expiresAt;

  return {
    ok: true,
    migration_pin: pin,
    expires_at: expiresAt.toISOString(),
    reason: reason || 'Hardware/OS migration',
  };
}

function migrateHardware(license, { token, hardware_id, migration_pin, sovereign_secret }) {
  if (!token || !hardware_id || !migration_pin) {
    return { ok: false, reason: 'missing_fields' };
  }

  const cleanPin = migration_pin.trim();
  if (cleanPin.length !== 6) {
    return { ok: false, reason: 'invalid_pin', message: 'Migration PIN must be 6 digits' };
  }

  if (!license.migration_pin || license.migration_pin !== cleanPin) {
    return { ok: false, reason: 'invalid_pin', message: 'Migration PIN is invalid.' };
  }

  if (!license.migration_pin_expires_at || new Date(license.migration_pin_expires_at) < new Date()) {
    return { ok: false, reason: 'expired_pin', message: 'Migration PIN has expired (48hr limit reached).' };
  }

  // Re-bind to new hardware
  license.hardware_id = hardware_id.trim();
  license.activated_at = new Date();
  license.migration_pin = null; // Single-use consumed
  license.migration_pin_expires_at = null;

  const activationToken = createHmac('sha256', sovereign_secret || 'secret')
    .update(`standalone:${license.school_id}:${hardware_id.trim()}`)
    .digest('hex');

  return {
    ok: true,
    is_activated: true,
    activation_token: activationToken,
    hardware_id: hardware_id.trim(),
  };
}

describe('Disaster Recovery — Sovereign Node Re-bind & Client Migration', () => {
  let mockLicense;
  const SECRET = 'test_sovereign_secret_key_123';
  const OLD_LINUX_HWID = 'linux_hw_fingerprint_abc';
  const NEW_WIN10_HWID = 'win10_hw_fingerprint_xyz';

  beforeEach(() => {
    mockLicense = {
      id: 'lic_potters_123',
      school_id: 'sch_thepotters',
      tier: 'diamond',
      hardware_id: OLD_LINUX_HWID,
      activated_at: new Date('2026-01-10T10:00:00Z'),
      migration_pin: null,
      migration_pin_expires_at: null,
    };
  });

  it('clears hardware binding and generates 48-hour Migration PIN on sovereign re-bind', () => {
    const res = rebindNode(mockLicense, { reason: 'Linux HDD crash -> Migrated to Windows 10' });

    expect(res.ok).toBe(true);
    expect(res.migration_pin).toMatch(/^\d{6}$/);
    expect(mockLicense.hardware_id).toBeNull();
    expect(mockLicense.activated_at).toBeNull();
    expect(mockLicense.migration_pin).toBe(res.migration_pin);
    expect(mockLicense.migration_pin_expires_at).toBeInstanceOf(Date);

    const hoursUntilExpiry = (mockLicense.migration_pin_expires_at.getTime() - Date.now()) / (1000 * 60 * 60);
    expect(hoursUntilExpiry).toBeGreaterThan(47.9);
    expect(hoursUntilExpiry).toBeLessThanOrEqual(48.0);
  });

  it('rejects client migration if PIN is incorrect or missing', () => {
    rebindNode(mockLicense, { reason: 'Test' });

    const resWrong = migrateHardware(mockLicense, {
      token: 'valid.token.here',
      hardware_id: NEW_WIN10_HWID,
      migration_pin: '999999',
      sovereign_secret: SECRET,
    });

    expect(resWrong.ok).toBe(false);
    expect(resWrong.reason).toBe('invalid_pin');
    expect(mockLicense.hardware_id).toBeNull();
  });

  it('rejects client migration if 48-hour PIN window has expired', () => {
    rebindNode(mockLicense, { reason: 'Test' });
    // Manually expire PIN by 1 millisecond
    mockLicense.migration_pin_expires_at = new Date(Date.now() - 1);

    const resExpired = migrateHardware(mockLicense, {
      token: 'valid.token.here',
      hardware_id: NEW_WIN10_HWID,
      migration_pin: mockLicense.migration_pin,
      sovereign_secret: SECRET,
    });

    expect(resExpired.ok).toBe(false);
    expect(resExpired.reason).toBe('expired_pin');
    expect(mockLicense.hardware_id).toBeNull();
  });

  it('successfully migrates to new Windows 10 hardware fingerprint and generates activation token', () => {
    const rebindRes = rebindNode(mockLicense, { reason: 'OS Migration' });

    const resMigrate = migrateHardware(mockLicense, {
      token: 'valid.token.here',
      hardware_id: NEW_WIN10_HWID,
      migration_pin: rebindRes.migration_pin,
      sovereign_secret: SECRET,
    });

    expect(resMigrate.ok).toBe(true);
    expect(resMigrate.is_activated).toBe(true);
    expect(resMigrate.hardware_id).toBe(NEW_WIN10_HWID);
    expect(resMigrate.activation_token).toBeTruthy();

    // Verify DB state updated
    expect(mockLicense.hardware_id).toBe(NEW_WIN10_HWID);
    expect(mockLicense.activated_at).toBeInstanceOf(Date);
    expect(mockLicense.migration_pin).toBeNull(); // Consumed
    expect(mockLicense.migration_pin_expires_at).toBeNull();
  });

  it('prevents replay attacks: consumed PIN cannot be reused a second time', () => {
    const rebindRes = rebindNode(mockLicense, { reason: 'OS Migration' });
    const pin = rebindRes.migration_pin;

    // First attempt succeeds
    const firstAttempt = migrateHardware(mockLicense, {
      token: 'valid.token.here',
      hardware_id: NEW_WIN10_HWID,
      migration_pin: pin,
      sovereign_secret: SECRET,
    });
    expect(firstAttempt.ok).toBe(true);

    // Second attempt with same PIN must fail
    const secondAttempt = migrateHardware(mockLicense, {
      token: 'valid.token.here',
      hardware_id: 'third_rogue_device_789',
      migration_pin: pin,
      sovereign_secret: SECRET,
    });
    expect(secondAttempt.ok).toBe(false);
    expect(secondAttempt.reason).toBe('invalid_pin');
    expect(mockLicense.hardware_id).toBe(NEW_WIN10_HWID);
  });
});
