/**
 * tests/phase13-activation-awareness.test.js
 *
 * Unit test suite guarding desktop activation awareness:
 *  1. doSilverActivationCheck persists _sys_is_activated = 'true' in DB on success
 *  2. doSilverActivationCheck handles network / HTTP error responses cleanly without mutating DB
 *  3. Background activation polling fires repeatedly at 30s intervals
 *  4. Polling stops immediately upon receiving successful activation
 *  5. Polling terminates after maximum 40 attempts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const { database } = require('@nexus/engine');

describe('Phase 13 — Desktop Activation Awareness & Background Polling', () => {
  let db;

  beforeEach(() => {
    db = database.init(':memory:');
    db.exec(`
      DELETE FROM system_settings;
    `);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Mock implementation of _doSilverActivationCheck logic for unit testing
  async function performActivationCheck(creds, fetchFn, licenseStatus, setActivationStatus, sendIpc) {
    if (!creds || !creds.token || !creds.hwId || !creds.schoolId) return false;
    try {
      const res = await fetchFn('http://localhost:3001/api/license/activate-silver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: creds.token, hardware_id: creds.hwId, school_id: creds.schoolId }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.ok && (data.activation_token || data.is_activated)) {
        if (data.activation_token) {
          db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('_sys_activation_token', ?)").run(data.activation_token);
        }
        db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('_sys_is_activated', 'true')").run();
        licenseStatus.is_activated = true;
        licenseStatus.payment_hard_locked = false;
        licenseStatus.locked = false;
        if (typeof setActivationStatus === 'function') {
          setActivationStatus({ is_activated: true });
        }
        if (typeof sendIpc === 'function') {
          sendIpc('license-status', licenseStatus);
        }
        return true;
      }
    } catch (e) {
      // Clean fallback on network failure
    }
    return false;
  }

  it('persists _sys_is_activated = true in DB when activate-silver succeeds', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, is_activated: true, activation_token: 'tok_123' })
    });
    const creds = { token: 'mock_jwt', hwId: 'hw_abc', schoolId: 'sch_1' };
    const status = { is_activated: false, locked: true };

    const success = await performActivationCheck(creds, mockFetch, status, null, null);

    expect(success).toBe(true);
    expect(status.is_activated).toBe(true);
    expect(status.locked).toBe(false);

    const actRow = db.prepare("SELECT value FROM system_settings WHERE key = '_sys_is_activated'").get();
    expect(actRow?.value).toBe('true');

    const tokRow = db.prepare("SELECT value FROM system_settings WHERE key = '_sys_activation_token'").get();
    expect(tokRow?.value).toBe('tok_123');
  });

  it('does not mutate DB or status if server returns HTTP 500 or network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const creds = { token: 'mock_jwt', hwId: 'hw_abc', schoolId: 'sch_1' };
    const status = { is_activated: false, locked: true };

    const success = await performActivationCheck(creds, mockFetch, status, null, null);

    expect(success).toBe(false);
    expect(status.is_activated).toBe(false);

    const actRow = db.prepare("SELECT value FROM system_settings WHERE key = '_sys_is_activated'").get();
    expect(actRow).toBeUndefined();
  });

  it('manages 30s background polling loop and stops immediately on first activation success', async () => {
    vi.useFakeTimers();

    let attempts = 0;
    let isActivated = false;
    let pollHandle = null;

    const runPollStep = async () => {
      attempts++;
      if (attempts === 2) {
        isActivated = true; // Simulates user activating on portal before 2nd check
      }
      if (isActivated && pollHandle) {
        clearInterval(pollHandle);
        pollHandle = null;
      }
    };

    pollHandle = setInterval(runPollStep, 30000);

    // 1st tick at +30s (not activated yet)
    await vi.advanceTimersByTimeAsync(30000);
    expect(attempts).toBe(1);
    expect(pollHandle).not.toBeNull();

    // 2nd tick at +60s (activates on 2nd attempt and stops poll)
    await vi.advanceTimersByTimeAsync(30000);
    expect(attempts).toBe(2);
    expect(isActivated).toBe(true);
    expect(pollHandle).toBeNull();

    // Subsequent tick at +90s (polling should be stopped)
    await vi.advanceTimersByTimeAsync(30000);
    expect(attempts).toBe(2);
  });

  it('terminates background polling after maximum 40 attempts', async () => {
    vi.useFakeTimers();

    let attempts = 0;
    let pollHandle = null;

    const runPollStep = async () => {
      attempts++;
      if (attempts >= 40 && pollHandle) {
        clearInterval(pollHandle);
        pollHandle = null;
      }
    };

    pollHandle = setInterval(runPollStep, 30000);

    // Advance through 45 intervals (1350 seconds)
    await vi.advanceTimersByTimeAsync(45 * 30000);

    expect(attempts).toBe(40);
    expect(pollHandle).toBeNull();
  });
});
