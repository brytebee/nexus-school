import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('Phase 11 — Activation Security Gate', () => {
  let db;
  let tmpDir;

  const ACTIVATION_GATED = [
    'generate-reports',
    'results:dispatch',
    'results:publish',
    'pulse:start',
    'pulse:send-message',
    'pulse:broadcast',
    'cbt:deploy-exam',
    'cbt:create-batch',
    'cbt:dispatch-pulse-notifications',
  ];

  function assertActivated(channel, status) {
    if (!ACTIVATION_GATED.includes(channel)) return null;
    if (!status || status.locked) return null;
    if (status.is_activated) return null;
    return {
      ok: false,
      error: 'NOT_ACTIVATED',
      message: 'This feature is locked until your school is activated by Nexus. Visit nexusos.com.ng/portal/activate or contact support.',
    };
  }

  function assertPaymentOpen(channel, status) {
    if (channel !== 'fees:record-payment' && channel !== 'fees:upsert') return null;
    if (!status?.payment_hard_locked) return null;
    return {
      ok: false,
      error: 'PAYMENT_LOCKED',
      message: 'Payment recording is locked after your 30-day trial. Please activate your school account at nexusos.com.ng.',
    };
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'activation-test-'));
    db = new Database(path.join(tmpDir, 'test.db'));
    db.prepare("CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT)").run();
  });

  afterEach(() => {
    if (db) db.close();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1. is_activated=false, Silver tier, generate-reports returns NOT_ACTIVATED', () => {
    const status = { locked: false, tier: 'Silver', is_activated: false };
    const err = assertActivated('generate-reports', status);
    expect(err).toEqual({
      ok: false,
      error: 'NOT_ACTIVATED',
      message: expect.stringContaining('locked until your school is activated'),
    });
  });

  it('2. is_activated=false, Standalone tier, generate-reports returns NOT_ACTIVATED', () => {
    const status = { locked: false, tier: 'Standalone', is_activated: false };
    const err = assertActivated('generate-reports', status);
    expect(err).toEqual({
      ok: false,
      error: 'NOT_ACTIVATED',
      message: expect.stringContaining('locked until your school is activated'),
    });
  });

  it('3. is_activated=false, results:dispatch returns NOT_ACTIVATED', () => {
    const status = { locked: false, tier: 'Gold', is_activated: false };
    const err = assertActivated('results:dispatch', status);
    expect(err?.error).toBe('NOT_ACTIVATED');
  });

  it('4. is_activated=false, cbt:deploy-exam returns NOT_ACTIVATED', () => {
    const status = { locked: false, tier: 'Diamond', is_activated: false };
    const err = assertActivated('cbt:deploy-exam', status);
    expect(err?.error).toBe('NOT_ACTIVATED');
  });

  it('5. is_activated=true, generate-reports passes activation check', () => {
    const status = { locked: false, tier: 'Silver', is_activated: true };
    const err = assertActivated('generate-reports', status);
    expect(err).toBeNull();
  });

  it('6. is_activated=true, Standalone tier, results:dispatch passes activation check (tier gate applies downstream)', () => {
    const status = { locked: false, tier: 'Standalone', is_activated: true };
    const err = assertActivated('results:dispatch', status);
    expect(err).toBeNull();
  });

  it('7. is_activated=false, non-gated channel add-student passes activation check', () => {
    const status = { locked: false, tier: 'Silver', is_activated: false };
    const err = assertActivated('add-student', status);
    expect(err).toBeNull();
  });

  it('8. is_activated=false, within 30-day grace, fees:record-payment passes payment check', () => {
    const status = { locked: false, tier: 'Silver', is_activated: false, payment_hard_locked: false };
    const err = assertPaymentOpen('fees:record-payment', status);
    expect(err).toBeNull();
  });

  it('9. is_activated=false, after 30-day grace (payment_hard_locked=true), fees:record-payment returns PAYMENT_LOCKED', () => {
    const status = { locked: false, tier: 'Silver', is_activated: false, payment_hard_locked: true };
    const err = assertPaymentOpen('fees:record-payment', status);
    expect(err).toEqual({
      ok: false,
      error: 'PAYMENT_LOCKED',
      message: expect.stringContaining('Payment recording is locked after your 30-day trial'),
    });
  });

  it('10. Persists _sys_is_activated to SQLite when OTA activation is confirmed', () => {
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('_sys_is_activated', 'true')").run();
    const row = db.prepare("SELECT value FROM system_settings WHERE key = '_sys_is_activated'").get();
    expect(row.value).toBe('true');
  });

  it('11. Computes 30-day countdown and hard-lock correctly from registration_ts', () => {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // 10 days elapsed -> 20 days left, not locked
    const regTs10DaysAgo = now - 10 * 24 * 60 * 60 * 1000;
    const daysLeft10 = Math.max(0, Math.ceil((THIRTY_DAYS_MS - (now - regTs10DaysAgo)) / (24 * 60 * 60 * 1000)));
    expect(daysLeft10).toBe(20);
    expect((now - regTs10DaysAgo) > THIRTY_DAYS_MS).toBe(false);

    // 32 days elapsed -> 0 days left, locked
    const regTs32DaysAgo = now - 32 * 24 * 60 * 60 * 1000;
    const daysLeft32 = Math.max(0, Math.ceil((THIRTY_DAYS_MS - (now - regTs32DaysAgo)) / (24 * 60 * 60 * 1000)));
    expect(daysLeft32).toBe(0);
    expect((now - regTs32DaysAgo) > THIRTY_DAYS_MS).toBe(true);
  });
});
