/**
 * tests/fee-pulse-retry.test.js
 *
 * Verifies Fee Pulse offline resilience and bot-ready retry behaviour:
 *  1. Offline batch logs FAILED entries cleanly without rate-limit blocking.
 *  2. 24h idempotency cooldown excludes FAILED rows so re-delivery is never blocked.
 *  3. retryFailedFeePulseLogs (bot_ready) dispatches recent FAILED entries in-place,
 *     updates wa_message_id/status/ack_level, and recomputes fee_pulse_batches.
 *  4. Live balance & phone checks: fully paid students become CLEARED (no message sent);
 *     partial payments send the updated balance.
 *  5. Deduplication across batches: students already reminded in another non-FAILED
 *     batch within 24h or duplicated across failed batches are not double-messaged.
 *  6. Mid-retry disconnect aborts cleanly without burning retry_count and resumes on reconnect.
 *  7. Auto-retry respects 24h window and maxAutoRetries=3, while manual batch retry overrides both.
 *  8. Deferred auto-retry executes once an active batch finishes.
 *  9. pulse-bot.js exports onBotReady lifecycle hook returning an unsubscribe function.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { database } = require('@nexus/engine');
const { createFeePulseService } = require('../fee-pulse-service.js');
const pulseBotModule = require('../pulse-bot.js');

function createHarness(botStatus = 'disconnected') {
  const sentEvents = [];
  let status = botStatus;
  let msgSeq = 0;

  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        sentEvents.push({ channel, payload });
      },
    },
  };

  const mockBot = {
    getPulseStatus: () => ({ status }),
    sendFeeReminderRaw: vi.fn(async (phone, _msg) => {
      if (status !== 'ready') {
        throw new Error('WhatsApp bot is not connected');
      }
      msgSeq++;
      return {
        ok: true,
        wa_message_id: `true_${phone}@c.us_MSG${msgSeq}`,
        ack: 1,
        status: 'SENT_OFFLINE',
      };
    }),
  };

  const service = createFeePulseService({
    getDb: () => database.getDb(),
    pulseBot: mockBot,
    getMainWindow: () => mockWindow,
    getSchoolName: () => 'Potters Berean Christian Academy',
    rateLimitMs: 0,
  });

  return {
    service,
    mockBot,
    sentEvents,
    setStatus: (next) => {
      status = next;
    },
  };
}

describe('Fee Pulse — Offline Failure & Bot-Ready Auto-Retry', () => {
  let db;

  beforeEach(() => {
    db = database.init(':memory:');
    db.exec(`
      DELETE FROM fee_pulse_logs;
      DELETE FROM fee_pulse_batches;
      DELETE FROM student_fees;
      DELETE FROM students;
      DELETE FROM school_term_config;
    `);
    db.prepare(`
      INSERT INTO school_term_config (id, academic_session, term)
      VALUES (1, '2026/2027', 'First Term')
    `).run();
  });

  function seedDebtor(id, name, phone, billed, paid = 0, isActive = 1) {
    db.prepare(`
      INSERT INTO students (id, name, class_name, parent_phone, is_active)
      VALUES (?, ?, 'Reading Readiness 1', ?, ?)
    `).run(id, name, phone, isActive);

    db.prepare(`
      INSERT INTO student_fees (student_id, academic_session, term, total_billed, total_paid, status)
      VALUES (?, '2026/2027', 'First Term', ?, ?, ?)
    `).run(id, billed, paid, paid >= billed ? 'cleared' : paid > 0 ? 'partial' : 'unpaid');
  }

  it('records FAILED logs when bot is offline and retries them when bot becomes ready', async () => {
    seedDebtor('STU-1', 'Wealth Orinya', '07066637871', 36000, 0);
    seedDebtor('STU-2', 'Yisheng Collinson', '08083224441', 16000, 0);

    const h = createHarness('disconnected');

    // 1. Auto batch runs while bot is off
    const batchRes = await h.service.runFeePulseBatch({ triggerSource: 'desktop_auto' });
    expect(batchRes.ok).toBe(true);
    expect(batchRes.sent).toBe(0);
    expect(batchRes.failed).toBe(2);
    expect(h.mockBot.sendFeeReminderRaw).not.toHaveBeenCalled();

    const logsBefore = db.prepare('SELECT * FROM fee_pulse_logs ORDER BY student_id').all();
    expect(logsBefore).toHaveLength(2);
    expect(logsBefore.every((l) => l.status === 'FAILED' && l.ack_level === -1 && l.retry_count === 0)).toBe(true);

    // 2. Bot comes online -> retry hook fires
    h.setStatus('ready');
    h.sentEvents.length = 0;

    const retryRes = await h.service.retryFailedFeePulseLogs({ reason: 'bot_ready' });
    expect(retryRes.ok).toBe(true);
    expect(retryRes.total).toBe(2);
    expect(retryRes.sent).toBe(2);
    expect(retryRes.failed).toBe(0);
    expect(h.mockBot.sendFeeReminderRaw).toHaveBeenCalledTimes(2);

    const logsAfter = db.prepare('SELECT * FROM fee_pulse_logs ORDER BY student_id').all();
    expect(logsAfter.every((l) => l.status === 'SENT_OFFLINE' && l.ack_level === 1 && l.wa_message_id)).toBe(true);

    const batchAfter = db.prepare('SELECT * FROM fee_pulse_batches WHERE id = ?').get(batchRes.batchId);
    expect(batchAfter.total_sent).toBe(2);
    expect(batchAfter.total_failed).toBe(0);
    expect(batchAfter.total_offline).toBe(2);

    // 3. Subsequent bot_ready event finds nothing to retry and emits no banner spam
    h.sentEvents.length = 0;
    const secondRetry = await h.service.retryFailedFeePulseLogs({ reason: 'bot_ready' });
    expect(secondRetry.total).toBe(0);
    expect(h.sentEvents).toHaveLength(0);
  });

  it('does not allow FAILED rows to block re-delivery in the 24h idempotency guard', async () => {
    seedDebtor('STU-1', 'Wealth Orinya', '07066637871', 36000, 0);
    seedDebtor('STU-2', 'Yisheng Collinson', '08083224441', 16000, 0);

    const h = createHarness('disconnected');
    await h.service.runFeePulseBatch({ triggerSource: 'desktop_auto' });

    // Simulate STU-2 already succeeding manually while STU-1 stayed FAILED
    db.prepare(`UPDATE fee_pulse_logs SET status = 'SENT_OFFLINE', ack_level = 1 WHERE student_id = 'STU-2'`).run();

    h.setStatus('ready');
    const secondBatch = await h.service.runFeePulseBatch({ triggerSource: 'desktop_manual' });
    expect(secondBatch.ok).toBe(true);
    expect(secondBatch.total).toBe(1);
    expect(secondBatch.sent).toBe(1);
    expect(h.mockBot.sendFeeReminderRaw).toHaveBeenCalledTimes(1);
    expect(h.mockBot.sendFeeReminderRaw.mock.calls[0][0]).toBe('07066637871');
  });

  it('skips cleared debtors and uses updated balance and phone on retry', async () => {
    seedDebtor('STU-1', 'Wealth Orinya', '07066637871', 36000, 0);
    seedDebtor('STU-2', 'Favour Johnson', '08138940448', 21000, 0);

    const h = createHarness('disconnected');
    const batchRes = await h.service.runFeePulseBatch({ triggerSource: 'desktop_auto' });

    // Before bot turns on: STU-1 pays in full, STU-2 pays 5,000 and updates phone
    db.prepare(`UPDATE student_fees SET total_paid = 36000, status = 'cleared' WHERE student_id = 'STU-1'`).run();
    db.prepare(`UPDATE student_fees SET total_paid = 5000, status = 'partial' WHERE student_id = 'STU-2'`).run();
    db.prepare(`UPDATE students SET parent_phone = '08099990000' WHERE id = 'STU-2'`).run();

    h.setStatus('ready');
    const retryRes = await h.service.retryFailedFeePulseLogs({ reason: 'bot_ready' });
    expect(retryRes.ok).toBe(true);
    expect(retryRes.cleared).toBe(1);
    expect(retryRes.sent).toBe(1);
    expect(retryRes.failed).toBe(0);

    expect(h.mockBot.sendFeeReminderRaw).toHaveBeenCalledTimes(1);
    expect(h.mockBot.sendFeeReminderRaw.mock.calls[0][0]).toBe('08099990000');
    expect(h.mockBot.sendFeeReminderRaw.mock.calls[0][1]).toContain('16,000');

    const log1 = db.prepare(`SELECT * FROM fee_pulse_logs WHERE student_id = 'STU-1'`).get();
    const log2 = db.prepare(`SELECT * FROM fee_pulse_logs WHERE student_id = 'STU-2'`).get();
    expect(log1.status).toBe('CLEARED');
    expect(log1.ack_level).toBe(0);
    expect(log2.status).toBe('SENT_OFFLINE');
    expect(log2.parent_phone).toBe('08099990000');

    const batch = db.prepare('SELECT * FROM fee_pulse_batches WHERE id = ?').get(batchRes.batchId);
    expect(batch.total_failed).toBe(0);
    expect(batch.total_sent).toBe(1);
  });

  it('deduplicates across multiple failed batches and skips students already reminded in last 24h', async () => {
    seedDebtor('STU-1', 'Wealth Orinya', '07066637871', 36000, 0);
    seedDebtor('STU-2', 'Yisheng Collinson', '08083224441', 16000, 0);

    const h = createHarness('disconnected');
    await h.service.runFeePulseBatch({ triggerSource: 'desktop_auto' });
    // Second failed batch on same day
    await h.service.runFeePulseBatch({ triggerSource: 'desktop_manual' });

    // Suppose STU-2 actually received a reminder in a third batch
    db.prepare(`INSERT INTO fee_pulse_batches (id, academic_session, term, trigger_source, total_targeted) VALUES ('fp_ok', '2026/2027', 'First Term', 'desktop_manual', 1)`).run();
    db.prepare(`
      INSERT INTO fee_pulse_logs (id, batch_id, student_id, student_name, parent_phone, original_balance, ack_level, status, dispatched_at)
      VALUES ('log_ok', 'fp_ok', 'STU-2', 'Yisheng Collinson', '08083224441', 16000, 1, 'SENT_OFFLINE', datetime('now'))
    `).run();

    h.setStatus('ready');
    const retryRes = await h.service.retryFailedFeePulseLogs({ reason: 'bot_ready' });
    expect(retryRes.ok).toBe(true);
    expect(retryRes.total).toBe(1);
    expect(retryRes.sent).toBe(1);
    expect(h.mockBot.sendFeeReminderRaw).toHaveBeenCalledTimes(1);
    expect(h.mockBot.sendFeeReminderRaw.mock.calls[0][0]).toBe('07066637871');
  });

  it('aborts cleanly on mid-retry disconnect without burning retry_count and resumes on next ready', async () => {
    seedDebtor('STU-1', 'Student One', '08011111111', 10000, 0);
    seedDebtor('STU-2', 'Student Two', '08022222222', 20000, 0);
    seedDebtor('STU-3', 'Student Three', '08033333333', 30000, 0);

    const h = createHarness('disconnected');
    const batchRes = await h.service.runFeePulseBatch({ triggerSource: 'desktop_auto' });

    h.setStatus('ready');
    let calls = 0;
    h.mockBot.sendFeeReminderRaw.mockImplementation(async (phone) => {
      calls++;
      if (calls === 2) {
        h.setStatus('disconnected');
        throw new Error('WhatsApp bot is not connected');
      }
      return { ok: true, wa_message_id: `msg_${calls}`, ack: 1, status: 'SENT_OFFLINE' };
    });

    const partialRes = await h.service.retryFailedFeePulseLogs({ reason: 'bot_ready' });
    expect(partialRes.ok).toBe(true);
    expect(partialRes.abortedDisconnected).toBe(true);
    expect(partialRes.sent).toBe(1);
    expect(partialRes.failed).toBe(2);

    const remainingLogs = db.prepare(`SELECT * FROM fee_pulse_logs WHERE status = 'FAILED'`).all();
    expect(remainingLogs).toHaveLength(2);
    expect(remainingLogs.every((l) => l.retry_count === 0)).toBe(true);

    // Bot reconnects cleanly and finishes remaining 2
    h.setStatus('ready');
    h.mockBot.sendFeeReminderRaw.mockImplementation(async (phone) => ({
      ok: true,
      wa_message_id: `resumed_${phone}`,
      ack: 1,
      status: 'SENT_OFFLINE',
    }));

    const finalRes = await h.service.retryFailedFeePulseLogs({ reason: 'bot_ready' });
    expect(finalRes.ok).toBe(true);
    expect(finalRes.abortedDisconnected).toBe(false);
    expect(finalRes.sent).toBe(2);
    expect(finalRes.failed).toBe(0);

    const batch = db.prepare('SELECT * FROM fee_pulse_batches WHERE id = ?').get(batchRes.batchId);
    expect(batch.total_sent).toBe(3);
    expect(batch.total_failed).toBe(0);
  });

  it('respects 24h window and maxAutoRetries on auto-retry, while manual batch retry overrides both', async () => {
    seedDebtor('STU-1', 'Stale Student', '08011111111', 15000, 0);
    seedDebtor('STU-2', 'Exhausted Student', '08022222222', 25000, 0);

    db.prepare(`
      INSERT INTO fee_pulse_batches (id, academic_session, term, trigger_source, total_targeted, total_failed, started_at)
      VALUES ('fp_old', '2026/2027', 'First Term', 'desktop_auto', 2, 2, datetime('now', '-30 hours'))
    `).run();

    db.prepare(`
      INSERT INTO fee_pulse_logs (id, batch_id, student_id, student_name, parent_phone, original_balance, ack_level, status, retry_count, dispatched_at)
      VALUES
        ('log_old', 'fp_old', 'STU-1', 'Stale Student', '08011111111', 15000, -1, 'FAILED', 0, datetime('now', '-30 hours')),
        ('log_max', 'fp_old', 'STU-2', 'Exhausted Student', '08022222222', 25000, -1, 'FAILED', 3, datetime('now', '-1 hours'))
    `).run();

    const h = createHarness('disconnected');
    // Manual retry while offline must fail loudly without touching rows
    const blockedRes = await h.service.retryFailedFeePulseLogs({ batchId: 'fp_old', reason: 'manual_batch_retry' });
    expect(blockedRes.ok).toBe(false);

    // Bot ready auto-retry skips both stale (>24h) and max-retried (>=3)
    h.setStatus('ready');
    const autoRes = await h.service.retryFailedFeePulseLogs({ reason: 'bot_ready' });
    expect(autoRes.total).toBe(0);
    expect(h.mockBot.sendFeeReminderRaw).not.toHaveBeenCalled();

    // Explicit manual batch retry dispatches both
    const manualRes = await h.service.retryFailedFeePulseLogs({ batchId: 'fp_old', reason: 'manual_batch_retry' });
    expect(manualRes.ok).toBe(true);
    expect(manualRes.total).toBe(2);
    expect(manualRes.sent).toBe(2);
    expect(manualRes.failed).toBe(0);
  });

  it('defers bot_ready retry if a batch runner is currently in progress', async () => {
    seedDebtor('STU-1', 'Wealth Orinya', '07066637871', 36000, 0);

    const h = createHarness('disconnected');
    let releaseFirstSend;
    const firstSendGate = new Promise((r) => { releaseFirstSend = r; });

    // Start batch while bot is momentarily ready, then fail first send
    h.setStatus('ready');
    h.mockBot.sendFeeReminderRaw.mockImplementationOnce(async () => {
      await firstSendGate;
      return { ok: false, status: 'FAILED', error: 'Temporary timeout' };
    });

    const batchPromise = h.service.runFeePulseBatch({ triggerSource: 'desktop_auto' });

    // Bot emits ready while runFeePulseBatch is mid-flight
    const deferredResult = await h.service.retryFailedFeePulseLogs({ reason: 'bot_ready' });
    expect(deferredResult.deferred).toBe(true);

    // Let active batch finish and allow deferred setImmediate to execute
    releaseFirstSend();
    await batchPromise;
    await new Promise((r) => setTimeout(r, 50));

    const log = db.prepare(`SELECT * FROM fee_pulse_logs WHERE student_id = 'STU-1'`).get();
    expect(log.status).toBe('SENT_OFFLINE');
    expect(h.mockBot.sendFeeReminderRaw).toHaveBeenCalledTimes(2);
  });

  it('exports onBotReady in pulse-bot.js returning an unsubscribe function', () => {
    expect(typeof pulseBotModule.onBotReady).toBe('function');
    const unsub = pulseBotModule.onBotReady(() => {});
    expect(typeof unsub).toBe('function');
    unsub();
  });
});
