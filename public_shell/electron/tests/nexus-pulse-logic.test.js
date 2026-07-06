/**
 * tests/nexus-pulse-logic.test.js
 *
 * Unit tests for the NexusPulse utilities (src/lib/pulseUtils.js).
 *
 * These tests import from the REAL production module that NexusPulse.tsx
 * also imports from. A change to pulseUtils.js that breaks the logic will
 * fail both the component at runtime AND these tests — there is no longer a
 * stale inlined copy in the test file.
 *
 * Covered:
 *   A. buildThreads()       — grouping, latest_message, sender_name resolution, sort
 *   B. botStatusReducer()   — all 6 status branches + QR + error interpolation
 *   C. findLatestIncoming() — reply-target resolution
 *   D. filterUnread()       — badge count / mark-read gate
 *   E. autostartPersist()   — localStorage write + IPC send contract
 *   F. applyNewMessage()    — pulse:new-message dedup guard
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildThreads,
  filterUnread,
  findLatestIncoming,
  botStatusReducer,
  autostartPersist,
  applyNewMessage,
} from '../src/lib/pulseUtils.js';

// ─── Shared fixture helpers ───────────────────────────────────────────────────
function msg(overrides = {}) {
  return {
    id:           overrides.id           ?? 1,
    sender_name:  overrides.sender_name  ?? 'Test Parent',
    sender_phone: overrides.sender_phone ?? '08031234567',
    content:      overrides.content      ?? 'Hello',
    received_at:  overrides.received_at  ?? '2026-07-06T10:00:00.000Z',
    status:       overrides.status       ?? 'unread',
    direction:    overrides.direction    ?? 'incoming',
  };
}

// ══════════════════════════════════════════════════════════════════════════════

describe('A. buildThreads — message grouping and sorting', () => {
  it('groups messages from the same phone into one thread', () => {
    const msgs = [
      msg({ id: 1, sender_phone: '08031234567', received_at: '2026-07-06T09:00:00.000Z' }),
      msg({ id: 2, sender_phone: '08031234567', received_at: '2026-07-06T10:00:00.000Z' }),
    ];
    const threads = buildThreads(msgs);
    expect(threads).toHaveLength(1);
    expect(threads[0].messages).toHaveLength(2);
  });

  it('creates separate threads for different phones', () => {
    const msgs = [
      msg({ id: 1, sender_phone: '08031111111' }),
      msg({ id: 2, sender_phone: '08032222222' }),
    ];
    expect(buildThreads(msgs)).toHaveLength(2);
  });

  it('latest_message is the most recent by received_at, regardless of input order', () => {
    const msgs = [
      msg({ id: 2, sender_phone: '08031234567', received_at: '2026-07-06T12:00:00.000Z' }),
      msg({ id: 1, sender_phone: '08031234567', received_at: '2026-07-06T09:00:00.000Z' }),
    ];
    expect(buildThreads(msgs)[0].latest_message.id).toBe(2);
  });

  it('sorts threads with the most-recently-active first', () => {
    const msgs = [
      msg({ id: 1, sender_phone: '08031111111', received_at: '2026-07-06T08:00:00.000Z' }),
      msg({ id: 2, sender_phone: '08032222222', received_at: '2026-07-06T12:00:00.000Z' }),
    ];
    expect(buildThreads(msgs)[0].sender_phone).toBe('08032222222');
  });

  it('overrides sender_name from "Unknown Parent" to a real name when a later message arrives', () => {
    const msgs = [
      msg({ id: 1, sender_phone: '08031234567', sender_name: 'Unknown Parent', received_at: '2026-07-06T09:00:00.000Z' }),
      msg({ id: 2, sender_phone: '08031234567', sender_name: 'Ada Okonkwo',    received_at: '2026-07-06T10:00:00.000Z' }),
    ];
    expect(buildThreads(msgs)[0].sender_name).toBe('Ada Okonkwo');
  });

  it('does NOT override a real name with "Unknown Parent" from a later message', () => {
    const msgs = [
      msg({ id: 1, sender_phone: '08031234567', sender_name: 'Ada Okonkwo',    received_at: '2026-07-06T09:00:00.000Z' }),
      msg({ id: 2, sender_phone: '08031234567', sender_name: 'Unknown Parent', received_at: '2026-07-06T10:00:00.000Z' }),
    ];
    expect(buildThreads(msgs)[0].sender_name).toBe('Ada Okonkwo');
  });

  it('returns empty array for no messages', () => {
    expect(buildThreads([])).toEqual([]);
  });

  it('handles a single message without errors', () => {
    const threads = buildThreads([msg({ id: 1 })]);
    expect(threads).toHaveLength(1);
    expect(threads[0].latest_message.id).toBe(1);
  });

  it('includes all messages in a thread regardless of input order', () => {
    const phone = '08031234567';
    const msgs = [
      msg({ id: 3, sender_phone: phone, received_at: '2026-07-06T11:00:00.000Z' }),
      msg({ id: 1, sender_phone: phone, received_at: '2026-07-06T09:00:00.000Z' }),
      msg({ id: 2, sender_phone: phone, received_at: '2026-07-06T10:00:00.000Z' }),
    ];
    expect(buildThreads(msgs)[0].messages).toHaveLength(3);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('B. botStatusReducer — all 6 status branches', () => {
  it('"starting" sets correct description and clears QR URL', () => {
    const r = botStatusReducer({ status: 'starting' });
    expect(r.botStatus).toBe('starting');
    expect(r.botStatusDesc).toMatch(/Please wait/);
    expect(r.qrCodeDataUrl).toBe('');
  });

  it('"qr" with data sets the QR URL', () => {
    const r = botStatusReducer({ status: 'qr', data: 'data:image/png;base64,ABC' });
    expect(r.qrCodeDataUrl).toBe('data:image/png;base64,ABC');
    expect(r.botStatusDesc).toMatch(/Scan code/);
  });

  it('"qr" without data leaves QR URL empty', () => {
    expect(botStatusReducer({ status: 'qr', data: null }).qrCodeDataUrl).toBe('');
  });

  it('"authenticated" clears QR URL and sets correct description', () => {
    const r = botStatusReducer({ status: 'authenticated' });
    expect(r.qrCodeDataUrl).toBe('');
    expect(r.botStatusDesc).toMatch(/Session verified/);
  });

  it('"ready" sets description and clears QR URL', () => {
    const r = botStatusReducer({ status: 'ready' });
    expect(r.qrCodeDataUrl).toBe('');
    expect(r.botStatusDesc).toMatch(/Parents can now WhatsApp/);
  });

  it('"error" with data interpolates the error message', () => {
    expect(botStatusReducer({ status: 'error', data: 'TIMEOUT' }).botStatusDesc).toBe('Error: TIMEOUT');
  });

  it('"error" without data shows the generic error text', () => {
    expect(botStatusReducer({ status: 'error' }).botStatusDesc).toBe('Bot encountered an initialization error.');
  });

  it('"disconnected" shows the "Start Bot" instruction', () => {
    expect(botStatusReducer({ status: 'disconnected' }).botStatusDesc).toMatch(/Start Bot/);
  });

  it('unknown status falls through to the default (disconnected) branch', () => {
    expect(botStatusReducer({ status: 'UNKNOWN_XYZ' }).botStatusDesc).toMatch(/Start Bot/);
  });

  it.each(['starting', 'qr', 'authenticated', 'ready', 'error', 'disconnected'])(
    'always resets loadingAction=false for status "%s"',
    (status) => {
      expect(botStatusReducer({ status }).loadingAction).toBe(false);
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────

describe('C. findLatestIncoming — reply-target resolution', () => {
  it('returns the last non-outgoing message', () => {
    const messages = [
      msg({ id: 1, direction: 'incoming' }),
      msg({ id: 2, direction: 'outgoing' }),
      msg({ id: 3, direction: 'incoming' }),
    ];
    expect(findLatestIncoming(messages).id).toBe(3);
  });

  it('skips trailing outgoing messages to find the latest incoming', () => {
    const messages = [
      msg({ id: 1, direction: 'incoming' }),
      msg({ id: 2, direction: 'outgoing' }),
      msg({ id: 3, direction: 'outgoing' }),
    ];
    expect(findLatestIncoming(messages).id).toBe(1);
  });

  it('returns null when all messages are outgoing', () => {
    const messages = [msg({ id: 1, direction: 'outgoing' }), msg({ id: 2, direction: 'outgoing' })];
    expect(findLatestIncoming(messages)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(findLatestIncoming([])).toBeNull();
  });

  it('treats undefined direction as non-outgoing (incoming)', () => {
    expect(findLatestIncoming([msg({ id: 5, direction: undefined })]).id).toBe(5);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('D. filterUnread — badge count / mark-read gate', () => {
  it('returns only incoming unread messages', () => {
    const messages = [
      msg({ id: 1, direction: 'incoming', status: 'unread' }),
      msg({ id: 2, direction: 'incoming', status: 'read' }),
      msg({ id: 3, direction: 'outgoing', status: 'unread' }),
    ];
    const result = filterUnread(messages);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it.each(['bot_handled', 'replied', 'read'])(
    'excludes messages with status "%s"',
    (status) => {
      expect(filterUnread([msg({ direction: 'incoming', status })])).toHaveLength(0);
    }
  );

  it('returns empty for an empty input', () => {
    expect(filterUnread([])).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('E. autostartPersist — localStorage and IPC contract', () => {
  let store = {};
  const mockStorage = {
    setItem: (k, v) => { store[k] = v; },
    getItem: (k) => store[k] ?? null,
  };

  beforeEach(() => { store = {}; });

  it('writes "true" to localStorage when enabled', () => {
    autostartPersist(true, mockStorage, null);
    expect(mockStorage.getItem('nexus_pulse_autostart')).toBe('true');
  });

  it('writes "false" to localStorage when disabled', () => {
    autostartPersist(false, mockStorage, null);
    expect(mockStorage.getItem('nexus_pulse_autostart')).toBe('false');
  });

  it('calls electronAPI.send with the correct channel and boolean value', () => {
    const electronAPI = { send: vi.fn() };
    autostartPersist(true, mockStorage, electronAPI);
    expect(electronAPI.send).toHaveBeenCalledWith('pulse:set-autostart', true);
  });

  it('does not throw when electronAPI is null (no Electron context)', () => {
    expect(() => autostartPersist(true, mockStorage, null)).not.toThrow();
  });

  it('sends false correctly to IPC', () => {
    const electronAPI = { send: vi.fn() };
    autostartPersist(false, mockStorage, electronAPI);
    expect(electronAPI.send).toHaveBeenCalledWith('pulse:set-autostart', false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('F. applyNewMessage — pulse:new-message dedup', () => {
  it('prepends a new message when its id is absent', () => {
    const prev = [msg({ id: 1 }), msg({ id: 2 })];
    const result = applyNewMessage(prev, msg({ id: 3 }));
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe(3);
  });

  it('returns the SAME array reference for a duplicate id (no re-render)', () => {
    const prev = [msg({ id: 1 }), msg({ id: 2 })];
    const result = applyNewMessage(prev, msg({ id: 1 }));
    expect(result).toBe(prev); // referential equality
  });

  it('seeds an empty list with the first incoming message', () => {
    const result = applyNewMessage([], msg({ id: 99 }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(99);
  });

  it('preserves existing message order with new message at the front', () => {
    const prev = [msg({ id: 5 }), msg({ id: 6 })];
    expect(applyNewMessage(prev, msg({ id: 7 })).map(m => m.id)).toEqual([7, 5, 6]);
  });
});
