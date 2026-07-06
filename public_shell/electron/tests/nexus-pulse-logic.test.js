/**
 * tests/nexus-pulse-logic.test.js
 *
 * Unit tests for the pure data-transform logic extracted from NexusPulse.tsx.
 *
 * These functions have zero Electron or React dependencies — they work on plain
 * arrays and objects, so Vitest can run them in Node without any DOM setup.
 *
 * Covered:
 *   A. buildThreads()         — message grouping, latest_message tracking,
 *                               sender_name resolution, final sort, dedup
 *   B. botStatusReducer()     — all 6 status branches, QR data handling,
 *                               error message interpolation, default branch
 *   C. findLatestIncoming()   — reverse-find for reply targeting
 *   D. filterUnread()         — unread-only gate used for mark-read and badge count
 *   E. autostartPersist()     — localStorage write + IPC send contract
 *   F. newMessageDedup()      — pulse:new-message dedup guard (prepend only if id absent)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── A. buildThreads ──────────────────────────────────────────────────────────
// Exact mirror of the useMemo in NexusPulse.tsx lines 121-147.
function buildThreads(messages) {
  const map = {};
  const sorted = [...messages].sort(
    (a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
  );

  sorted.forEach(msg => {
    const phone = msg.sender_phone;
    if (!map[phone]) {
      map[phone] = {
        sender_phone: phone,
        sender_name: msg.sender_name,
        latest_message: msg,
        messages: [],
      };
    }
    map[phone].messages.push(msg);
    if (new Date(msg.received_at).getTime() >= new Date(map[phone].latest_message.received_at).getTime()) {
      map[phone].latest_message = msg;
      if (msg.sender_name !== 'Unknown Parent') {
        map[phone].sender_name = msg.sender_name;
      }
    }
  });

  return Object.values(map).sort(
    (a, b) =>
      new Date(b.latest_message.received_at).getTime() -
      new Date(a.latest_message.received_at).getTime()
  );
}

// ─── B. botStatusReducer ─────────────────────────────────────────────────────
// Mirrors the switch inside handleBotStatusChange (lines 184-216).
function botStatusReducer(val) {
  const { status, data } = val;
  let botStatusDesc = '';
  let qrCodeDataUrl = '';
  let loadingAction = false; // always reset to false on any incoming status

  switch (status) {
    case 'starting':
      botStatusDesc = 'Please wait while the WhatsApp engine starts.';
      qrCodeDataUrl = '';
      break;
    case 'qr':
      botStatusDesc = 'Open WhatsApp on the school phone → Linked Devices → Link a Device → Scan code.';
      if (data) qrCodeDataUrl = data;
      break;
    case 'authenticated':
      botStatusDesc = 'Session verified. The bot will be ready in a moment.';
      qrCodeDataUrl = '';
      break;
    case 'ready':
      botStatusDesc = 'Parents can now WhatsApp the school number to check results, attendance & fees.';
      qrCodeDataUrl = '';
      break;
    case 'error':
      botStatusDesc = data ? `Error: ${data}` : 'Bot encountered an initialization error.';
      qrCodeDataUrl = '';
      break;
    case 'disconnected':
    default:
      botStatusDesc = 'Click "Start Bot" to initialise the WhatsApp engine. Scan the QR code.';
      qrCodeDataUrl = '';
      break;
  }

  return { botStatus: status, botStatusDesc, qrCodeDataUrl, loadingAction };
}

// ─── C. findLatestIncoming ───────────────────────────────────────────────────
// Mirrors lines 333-335: [...activeThread.messages].reverse().find(m => m.direction !== 'outgoing')
function findLatestIncoming(messages) {
  return [...messages].reverse().find(m => m.direction !== 'outgoing') || null;
}

// ─── D. filterUnread ─────────────────────────────────────────────────────────
// Mirrors the unread filter used in handleSelectThread, the useEffect, and the badge.
function filterUnread(messages) {
  return messages.filter(m => m.direction !== 'outgoing' && m.status === 'unread');
}

// ─── E. autostartPersist ─────────────────────────────────────────────────────
// Mirrors handleAutostartToggle (lines 321-327).
function autostartPersist(checked, localStorage, ipcSend) {
  localStorage.setItem('nexus_pulse_autostart', checked ? 'true' : 'false');
  if (ipcSend) ipcSend('pulse:set-autostart', checked);
}

// ─── F. newMessageDedup ──────────────────────────────────────────────────────
// Mirrors the pulse:new-message IPC listener (lines 112-117).
function applyNewMessage(prev, newMsg) {
  if (prev.some(m => m.id === newMsg.id)) return prev;
  return [newMsg, ...prev];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
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
// TESTS
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
    const threads = buildThreads(msgs);
    expect(threads).toHaveLength(2);
  });

  it('latest_message is the most recent by received_at, regardless of input order', () => {
    const msgs = [
      msg({ id: 2, sender_phone: '08031234567', received_at: '2026-07-06T12:00:00.000Z' }),
      msg({ id: 1, sender_phone: '08031234567', received_at: '2026-07-06T09:00:00.000Z' }),
    ];
    const threads = buildThreads(msgs);
    expect(threads[0].latest_message.id).toBe(2);
  });

  it('sorts threads with most-recent-latest_message first', () => {
    const msgs = [
      msg({ id: 1, sender_phone: '08031111111', received_at: '2026-07-06T08:00:00.000Z' }),
      msg({ id: 2, sender_phone: '08032222222', received_at: '2026-07-06T12:00:00.000Z' }),
    ];
    const threads = buildThreads(msgs);
    expect(threads[0].sender_phone).toBe('08032222222'); // newer on top
  });

  it('overrides sender_name from "Unknown Parent" to a real name when a later real-named message arrives', () => {
    const msgs = [
      msg({ id: 1, sender_phone: '08031234567', sender_name: 'Unknown Parent', received_at: '2026-07-06T09:00:00.000Z' }),
      msg({ id: 2, sender_phone: '08031234567', sender_name: 'Ada Okonkwo',    received_at: '2026-07-06T10:00:00.000Z' }),
    ];
    const threads = buildThreads(msgs);
    expect(threads[0].sender_name).toBe('Ada Okonkwo');
  });

  it('does NOT override a real name with "Unknown Parent" from a later message', () => {
    const msgs = [
      msg({ id: 1, sender_phone: '08031234567', sender_name: 'Ada Okonkwo',    received_at: '2026-07-06T09:00:00.000Z' }),
      msg({ id: 2, sender_phone: '08031234567', sender_name: 'Unknown Parent', received_at: '2026-07-06T10:00:00.000Z' }),
    ];
    const threads = buildThreads(msgs);
    // "Unknown Parent" is the latest_message but name stays 'Ada Okonkwo'
    expect(threads[0].sender_name).toBe('Ada Okonkwo');
  });

  it('returns empty array when given no messages', () => {
    expect(buildThreads([])).toEqual([]);
  });

  it('handles a single message correctly', () => {
    const threads = buildThreads([msg({ id: 1 })]);
    expect(threads).toHaveLength(1);
    expect(threads[0].messages).toHaveLength(1);
    expect(threads[0].latest_message.id).toBe(1);
  });

  it('all messages in a thread are included regardless of sort order', () => {
    const phone = '08031234567';
    const msgs = [
      msg({ id: 3, sender_phone: phone, received_at: '2026-07-06T11:00:00.000Z' }),
      msg({ id: 1, sender_phone: phone, received_at: '2026-07-06T09:00:00.000Z' }),
      msg({ id: 2, sender_phone: phone, received_at: '2026-07-06T10:00:00.000Z' }),
    ];
    const threads = buildThreads(msgs);
    expect(threads[0].messages).toHaveLength(3);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('B. botStatusReducer — all 6 status branches', () => {
  it('"starting" sets correct description and clears QR', () => {
    const result = botStatusReducer({ status: 'starting' });
    expect(result.botStatus).toBe('starting');
    expect(result.botStatusDesc).toMatch(/Please wait/);
    expect(result.qrCodeDataUrl).toBe('');
    expect(result.loadingAction).toBe(false);
  });

  it('"qr" with data sets QR URL', () => {
    const result = botStatusReducer({ status: 'qr', data: 'data:image/png;base64,ABC' });
    expect(result.qrCodeDataUrl).toBe('data:image/png;base64,ABC');
    expect(result.botStatusDesc).toMatch(/Scan code/);
  });

  it('"qr" without data does NOT set QR URL (stays empty)', () => {
    const result = botStatusReducer({ status: 'qr', data: null });
    expect(result.qrCodeDataUrl).toBe('');
  });

  it('"authenticated" clears QR and sets correct description', () => {
    const result = botStatusReducer({ status: 'authenticated' });
    expect(result.qrCodeDataUrl).toBe('');
    expect(result.botStatusDesc).toMatch(/Session verified/);
  });

  it('"ready" sets description and clears QR', () => {
    const result = botStatusReducer({ status: 'ready' });
    expect(result.qrCodeDataUrl).toBe('');
    expect(result.botStatusDesc).toMatch(/Parents can now WhatsApp/);
  });

  it('"error" with data interpolates the error message', () => {
    const result = botStatusReducer({ status: 'error', data: 'TIMEOUT' });
    expect(result.botStatusDesc).toBe('Error: TIMEOUT');
    expect(result.qrCodeDataUrl).toBe('');
  });

  it('"error" without data shows generic error text', () => {
    const result = botStatusReducer({ status: 'error' });
    expect(result.botStatusDesc).toBe('Bot encountered an initialization error.');
  });

  it('"disconnected" clears QR and shows start instruction', () => {
    const result = botStatusReducer({ status: 'disconnected' });
    expect(result.qrCodeDataUrl).toBe('');
    expect(result.botStatusDesc).toMatch(/Start Bot/);
  });

  it('unknown status falls through to default (disconnected behaviour)', () => {
    const result = botStatusReducer({ status: 'UNKNOWN_XYZ' });
    expect(result.botStatusDesc).toMatch(/Start Bot/);
  });

  it('always resets loadingAction to false regardless of status', () => {
    for (const status of ['starting', 'qr', 'authenticated', 'ready', 'error', 'disconnected']) {
      expect(botStatusReducer({ status }).loadingAction).toBe(false);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('C. findLatestIncoming — reply-target resolution', () => {
  it('finds the most recent incoming message (last in array, non-outgoing)', () => {
    const messages = [
      msg({ id: 1, direction: 'incoming', received_at: '2026-07-06T09:00:00.000Z' }),
      msg({ id: 2, direction: 'outgoing', received_at: '2026-07-06T10:00:00.000Z' }),
      msg({ id: 3, direction: 'incoming', received_at: '2026-07-06T11:00:00.000Z' }),
    ];
    const found = findLatestIncoming(messages);
    expect(found.id).toBe(3);
  });

  it('skips outgoing messages and finds the latest incoming', () => {
    const messages = [
      msg({ id: 1, direction: 'incoming' }),
      msg({ id: 2, direction: 'outgoing' }),
      msg({ id: 3, direction: 'outgoing' }),
    ];
    const found = findLatestIncoming(messages);
    expect(found.id).toBe(1);
  });

  it('returns null when all messages are outgoing', () => {
    const messages = [
      msg({ id: 1, direction: 'outgoing' }),
      msg({ id: 2, direction: 'outgoing' }),
    ];
    expect(findLatestIncoming(messages)).toBeNull();
  });

  it('returns null on empty message list', () => {
    expect(findLatestIncoming([])).toBeNull();
  });

  it('treats undefined direction as incoming (not "outgoing")', () => {
    const messages = [msg({ id: 5, direction: undefined })];
    const found = findLatestIncoming(messages);
    expect(found.id).toBe(5);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('D. filterUnread — unread gate for badge count and mark-read', () => {
  it('returns only incoming unread messages', () => {
    const messages = [
      msg({ id: 1, direction: 'incoming', status: 'unread' }),
      msg({ id: 2, direction: 'incoming', status: 'read' }),
      msg({ id: 3, direction: 'outgoing', status: 'unread' }), // outgoing, excluded
    ];
    const unread = filterUnread(messages);
    expect(unread).toHaveLength(1);
    expect(unread[0].id).toBe(1);
  });

  it('excludes bot_handled and replied messages', () => {
    const messages = [
      msg({ id: 1, direction: 'incoming', status: 'bot_handled' }),
      msg({ id: 2, direction: 'incoming', status: 'replied' }),
      msg({ id: 3, direction: 'incoming', status: 'unread' }),
    ];
    expect(filterUnread(messages)).toHaveLength(1);
    expect(filterUnread(messages)[0].id).toBe(3);
  });

  it('returns empty array when all messages are read or outgoing', () => {
    const messages = [
      msg({ id: 1, direction: 'incoming', status: 'read' }),
      msg({ id: 2, direction: 'outgoing', status: 'unread' }),
    ];
    expect(filterUnread(messages)).toHaveLength(0);
  });

  it('returns empty array on empty input', () => {
    expect(filterUnread([])).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('E. autostartPersist — localStorage and IPC contract', () => {
  let store = {};
  const mockLocalStorage = {
    setItem: (key, val) => { store[key] = val; },
    getItem: (key) => store[key] ?? null,
  };

  beforeEach(() => { store = {}; });

  it('writes "true" string to localStorage when enabled', () => {
    autostartPersist(true, mockLocalStorage, null);
    expect(mockLocalStorage.getItem('nexus_pulse_autostart')).toBe('true');
  });

  it('writes "false" string to localStorage when disabled', () => {
    autostartPersist(false, mockLocalStorage, null);
    expect(mockLocalStorage.getItem('nexus_pulse_autostart')).toBe('false');
  });

  it('calls ipcSend with the correct channel and value', () => {
    const ipcSend = vi.fn();
    autostartPersist(true, mockLocalStorage, ipcSend);
    expect(ipcSend).toHaveBeenCalledWith('pulse:set-autostart', true);
  });

  it('does not throw when ipcSend is null (no electronAPI)', () => {
    expect(() => autostartPersist(true, mockLocalStorage, null)).not.toThrow();
  });

  it('persists false correctly and sends to IPC', () => {
    const ipcSend = vi.fn();
    autostartPersist(false, mockLocalStorage, ipcSend);
    expect(ipcSend).toHaveBeenCalledWith('pulse:set-autostart', false);
    expect(mockLocalStorage.getItem('nexus_pulse_autostart')).toBe('false');
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('F. newMessageDedup — pulse:new-message listener dedup', () => {
  it('prepends a new message to the list when id is absent', () => {
    const prev = [msg({ id: 1 }), msg({ id: 2 })];
    const result = applyNewMessage(prev, msg({ id: 3 }));
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe(3); // new message is first
  });

  it('does NOT add a duplicate message when id already exists', () => {
    const prev = [msg({ id: 1 }), msg({ id: 2 })];
    const result = applyNewMessage(prev, msg({ id: 1 })); // same id as existing
    expect(result).toHaveLength(2);
    expect(result).toBe(prev); // same reference — no re-render triggered
  });

  it('returns an empty-origin list with the new message on initial empty state', () => {
    const result = applyNewMessage([], msg({ id: 99 }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(99);
  });

  it('preserves existing message order (new message at front)', () => {
    const prev = [msg({ id: 5 }), msg({ id: 6 })];
    const result = applyNewMessage(prev, msg({ id: 7 }));
    expect(result.map(m => m.id)).toEqual([7, 5, 6]);
  });
});
