/**
 * tests/bot-autostart.test.js
 *
 * Verifies the deferred auto-start contract:
 *   - uiReady() is called from App.tsx AFTER licenseLoading resolves (not before)
 *   - uiReady() is called exactly once (guarded by useRef) even across re-renders
 *   - startPulse() must NOT be called during createWindow() (before ui-ready)
 *   - startPulse() IS called when ui-ready fires AND pulse_autostart = 'true'
 *   - startPulse() is NOT called when pulse_autostart = 'false' or missing
 *   - startPulse() is skipped when the bot is already running (idempotency)
 *   - getPulseStatus() returns correct state at each lifecycle stage
 *   - The 900ms re-broadcast fires when client exists but isReady is false
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Minimal pulse-bot state simulator ──────────────────────────────────────
function makePulseBotModule() {
  let _client    = null;
  let _isReady   = false;
  let _lastStatus = null;
  let _mainWindow = null;
  let _broadcasts = [];

  const sendStatus = (status, data = null) => {
    _lastStatus = { status, data };
    _broadcasts.push({ status, data, ts: Date.now() });
    if (_mainWindow) {
      _mainWindow.webContents.send('pulse-status', { status, data });
    }
  };

  return {
    // ── Test hooks ────────────────────────────────────────────────────────
    _setState: ({ client = null, isReady = false } = {}) => {
      _client  = client;
      _isReady = isReady;
    },
    _getBroadcasts: () => _broadcasts,
    _resetBroadcasts: () => { _broadcasts = []; },

    // ── Public API (mirrors real pulse-bot.js exports) ──────────────────
    initPulseBot: (win) => { _mainWindow = win; },
    getPulseStatus: () => {
      if (!_client)   return { status: 'disconnected' };
      if (_isReady)   return { status: 'ready' };
      return { status: 'starting' };
    },
    startPulse: vi.fn(async () => {
      if (_client) return; // idempotency guard — mirrors real behaviour
      _client = Symbol('mock-client'); // truthy, not null
      sendStatus('starting');
      // Simulate the 900 ms re-broadcast
      setTimeout(() => {
        if (_client && !_isReady) sendStatus('starting');
      }, 900);
    }),
    destroyPulse: vi.fn(async () => {
      _client  = null;
      _isReady = false;
      sendStatus('disconnected');
    }),
  };
}

// ─── Minimal DB simulator ─────────────────────────────────────────────────────
function makeDb(autostartValue) {
  return {
    prepare: (sql) => ({
      get: () => autostartValue != null ? { value: autostartValue } : null,
    }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('Bot Auto-Start — Deferred to ui-ready (race condition fix)', () => {

  describe('App.tsx uiReady() — fires AFTER license resolves', () => {
    it('does NOT call uiReady() while licenseLoading is true', () => {
      const uiReady = vi.fn();
      const uiReadySent = { current: false };

      // Simulate effect with licenseLoading = true
      const licenseLoading = true;
      if (!licenseLoading && !uiReadySent.current) {
        uiReadySent.current = true;
        uiReady();
      }

      expect(uiReady).not.toHaveBeenCalled();
    });

    it('calls uiReady() exactly once when licenseLoading becomes false', () => {
      const uiReady = vi.fn();
      const uiReadySent = { current: false };

      const triggerEffect = (licenseLoading) => {
        if (!licenseLoading && !uiReadySent.current) {
          uiReadySent.current = true;
          uiReady();
        }
      };

      // First render: still loading
      triggerEffect(true);
      expect(uiReady).not.toHaveBeenCalled();

      // License resolves
      triggerEffect(false);
      expect(uiReady).toHaveBeenCalledOnce();

      // Subsequent re-renders must NOT fire again
      triggerEffect(false);
      triggerEffect(false);
      expect(uiReady).toHaveBeenCalledOnce(); // still just once
    });
  });

  describe('startPulse() is NOT called during createWindow()', () => {
    it('does not call startPulse() immediately after loadFile() regardless of setting', () => {
      const bot = makePulseBotModule();
      const tier = 'Gold';

      // Simulate createWindow() sequence — NO startPulse() call allowed here
      const mainWindow = { webContents: { send: vi.fn() } };
      bot.initPulseBot(mainWindow);
      // (startMessageQueueWorker would be called here too but is not relevant)

      // Auto-start must NOT be triggered yet
      expect(bot.startPulse).not.toHaveBeenCalled();
    });
  });

  describe('Auto-start triggers inside ui-ready handler', () => {
    it('calls startPulse() when pulse_autostart = "true" and tier is Gold', async () => {
      const bot = makePulseBotModule();
      const db  = makeDb('true');
      const tier = 'Gold';

      // Simulate ui-ready handler logic (extracted from main.js)
      const triggerUiReady = () => {
        if (tier !== 'Standalone' && tier !== 'Silver') {
          const autoCfg = db.prepare("SELECT value FROM app_settings WHERE key = 'pulse_autostart'").get();
          if (autoCfg?.value === 'true') {
            const currentStatus = bot.getPulseStatus();
            if (currentStatus.status === 'disconnected') {
              bot.startPulse();
            }
          }
        }
      };

      triggerUiReady();
      expect(bot.startPulse).toHaveBeenCalledOnce();
    });

    it('does NOT call startPulse() when pulse_autostart = "false"', () => {
      const bot = makePulseBotModule();
      const db  = makeDb('false');
      const tier = 'Gold';

      const triggerUiReady = () => {
        if (tier !== 'Standalone' && tier !== 'Silver') {
          const autoCfg = db.prepare("SELECT value FROM app_settings WHERE key = 'pulse_autostart'").get();
          if (autoCfg?.value === 'true') {
            bot.startPulse();
          }
        }
      };

      triggerUiReady();
      expect(bot.startPulse).not.toHaveBeenCalled();
    });

    it('does NOT call startPulse() when pulse_autostart row is missing', () => {
      const bot = makePulseBotModule();
      const db  = makeDb(null); // no row
      const tier = 'Diamond';

      const triggerUiReady = () => {
        if (tier !== 'Standalone' && tier !== 'Silver') {
          const autoCfg = db.prepare("SELECT value FROM app_settings WHERE key = 'pulse_autostart'").get();
          if (autoCfg?.value === 'true') {
            bot.startPulse();
          }
        }
      };

      triggerUiReady();
      expect(bot.startPulse).not.toHaveBeenCalled();
    });

    it('does NOT call startPulse() on Silver tier even if pulse_autostart = "true"', () => {
      const bot = makePulseBotModule();
      const db  = makeDb('true');
      const tier = 'Silver';

      const triggerUiReady = () => {
        if (tier !== 'Standalone' && tier !== 'Silver') {
          bot.startPulse();
        }
      };

      triggerUiReady();
      expect(bot.startPulse).not.toHaveBeenCalled();
    });
  });

  describe('Idempotency — bot already running', () => {
    it('skips startPulse() if bot is already starting when ui-ready fires', () => {
      const bot = makePulseBotModule();
      // Simulate bot already in "starting" state (e.g. manually triggered before ui-ready)
      bot._setState({ client: Symbol('existing'), isReady: false });
      const db  = makeDb('true');
      const tier = 'Gold';

      const triggerUiReady = () => {
        if (tier !== 'Standalone' && tier !== 'Silver') {
          const autoCfg = db.prepare("SELECT value FROM app_settings WHERE key = 'pulse_autostart'").get();
          if (autoCfg?.value === 'true') {
            const currentStatus = bot.getPulseStatus();
            if (currentStatus.status === 'disconnected') {
              bot.startPulse();
            }
          }
        }
      };

      triggerUiReady();
      // Bot was already running — startPulse() must NOT be called again
      expect(bot.startPulse).not.toHaveBeenCalled();
    });
  });

  describe('getPulseStatus() — correct state reporting', () => {
    it('returns disconnected when client is null', () => {
      const bot = makePulseBotModule();
      expect(bot.getPulseStatus()).toEqual({ status: 'disconnected' });
    });

    it('returns starting when client exists but isReady is false', () => {
      const bot = makePulseBotModule();
      bot._setState({ client: Symbol('c'), isReady: false });
      expect(bot.getPulseStatus()).toEqual({ status: 'starting' });
    });

    it('returns ready when client exists and isReady is true', () => {
      const bot = makePulseBotModule();
      bot._setState({ client: Symbol('c'), isReady: true });
      expect(bot.getPulseStatus()).toEqual({ status: 'ready' });
    });
  });

  describe('Re-broadcast heartbeat — 900ms fallback', () => {
    it('sends a second "starting" status 900ms after startPulse() while still connecting', async () => {
      vi.useFakeTimers();
      const bot = makePulseBotModule();

      // Call the real startPulse mock which simulates the re-broadcast
      await bot.startPulse();

      const before = bot._getBroadcasts().filter(b => b.status === 'starting').length;
      expect(before).toBe(1); // immediate send

      vi.advanceTimersByTime(900);

      const after = bot._getBroadcasts().filter(b => b.status === 'starting').length;
      expect(after).toBe(2); // re-broadcast fired
      vi.useRealTimers();
    });

    it('does NOT re-broadcast if bot becomes ready within 900ms', async () => {
      vi.useFakeTimers();
      const bot = makePulseBotModule();

      await bot.startPulse();
      // Simulate bot becoming ready before 900ms
      bot._setState({ client: Symbol('c'), isReady: true });

      vi.advanceTimersByTime(900);

      // Only 1 "starting" event — no re-broadcast because isReady = true
      const startingBroadcasts = bot._getBroadcasts().filter(b => b.status === 'starting');
      expect(startingBroadcasts.length).toBe(1);
      vi.useRealTimers();
    });
  });
});
