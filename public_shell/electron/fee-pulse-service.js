// ═══════════════════════════════════════════════════════════════════════════════
// Nexus Fee Pulse Engine — Batch Dispatch, Idempotency & Bot-Ready Retry
// ═══════════════════════════════════════════════════════════════════════════════
"use strict";

function ensureFeePulseTables(db) {
  if (!db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS fee_pulse_batches (
      id TEXT PRIMARY KEY,
      academic_session TEXT NOT NULL,
      term TEXT NOT NULL,
      trigger_source TEXT NOT NULL,
      total_targeted INTEGER DEFAULT 0,
      total_sent INTEGER DEFAULT 0,
      total_delivered INTEGER DEFAULT 0,
      total_read INTEGER DEFAULT 0,
      total_failed INTEGER DEFAULT 0,
      total_offline INTEGER DEFAULT 0,
      total_not_on_wa INTEGER DEFAULT 0,
      total_debt_targeted REAL DEFAULT 0,
      total_debt_recovered REAL DEFAULT 0,
      status TEXT DEFAULT 'in_progress',
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS fee_pulse_logs (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      student_id INTEGER NOT NULL,
      student_name TEXT NOT NULL,
      class_name TEXT,
      parent_phone TEXT NOT NULL,
      original_balance REAL NOT NULL,
      wa_message_id TEXT,
      ack_level INTEGER DEFAULT 0,
      status TEXT DEFAULT 'DISPATCHED',
      retry_count INTEGER DEFAULT 0,
      error_message TEXT,
      dispatched_at TEXT DEFAULT (datetime('now')),
      delivered_at TEXT,
      read_at TEXT,
      FOREIGN KEY(batch_id) REFERENCES fee_pulse_batches(id)
    );

    CREATE INDEX IF NOT EXISTS idx_fee_pulse_logs_batch_id ON fee_pulse_logs(batch_id);
    CREATE INDEX IF NOT EXISTS idx_fee_pulse_logs_student_id ON fee_pulse_logs(student_id);
    CREATE INDEX IF NOT EXISTS idx_fee_pulse_logs_wa_msg_id ON fee_pulse_logs(wa_message_id);
  `);

  const alterSafe = (sql) => { try { db.exec(sql); } catch (_) { /* already exists */ } };
  alterSafe(`ALTER TABLE fee_pulse_logs ADD COLUMN retry_count INTEGER DEFAULT 0`);
  alterSafe(`ALTER TABLE fee_pulse_logs ADD COLUMN error_message TEXT`);
}

function formatFeeReminderMessage({ schoolName, studentName, balance }) {
  const safeSchool = schoolName || 'Nexus School';
  const safeBalance = Math.max(0, Number(balance || 0));
  const balanceStr = safeBalance.toLocaleString('en-NG');
  return `Hello! This is a reminder from ${safeSchool}.\n\nStudent: *${studentName}*\nOutstanding Balance: *₦${balanceStr}*\n\nKindly make payment to avoid any inconvenience. Thank you! 📚`;
}

function isBotReadyStatus(pulseBot) {
  if (typeof pulseBot?.getPulseStatus !== 'function') return true;
  return pulseBot.getPulseStatus()?.status === 'ready';
}

function isBotDisconnectedError(errMsg, pulseBot) {
  if (typeof pulseBot?.getPulseStatus === 'function' && pulseBot.getPulseStatus()?.status !== 'ready') {
    return true;
  }
  return /not connected|not ready|reconnecting|page closed|detached frame|session closed/i.test(String(errMsg || ''));
}

async function dispatchSingleFeeReminder({ pulseBot, schoolName, studentName, parentPhone, balance }) {
  if (!isBotReadyStatus(pulseBot)) {
    return {
      ok: false,
      logStatus: 'FAILED',
      ackLevel: -1,
      waMessageId: null,
      errorMessage: 'WhatsApp bot is not connected',
      botDisconnected: true
    };
  }

  const msg = formatFeeReminderMessage({ schoolName, studentName, balance });

  let sendResult;
  try {
    sendResult = await pulseBot.sendFeeReminderRaw(parentPhone, msg);
  } catch (sendErr) {
    const errMsg = sendErr?.message || String(sendErr);
    return {
      ok: false,
      logStatus: 'FAILED',
      ackLevel: -1,
      waMessageId: null,
      errorMessage: errMsg,
      botDisconnected: isBotDisconnectedError(errMsg, pulseBot)
    };
  }

  if (!sendResult?.ok) {
    if (sendResult?.status === 'NOT_ON_WHATSAPP') {
      return {
        ok: false,
        logStatus: 'NOT_ON_WHATSAPP',
        ackLevel: -2,
        waMessageId: null,
        errorMessage: sendResult.error || 'Number not registered on WhatsApp',
        botDisconnected: false
      };
    }
    const errMsg = sendResult?.error || 'Dispatch failed';
    return {
      ok: false,
      logStatus: 'FAILED',
      ackLevel: -1,
      waMessageId: null,
      errorMessage: errMsg,
      botDisconnected: isBotDisconnectedError(errMsg, pulseBot)
    };
  }

  return {
    ok: true,
    logStatus: sendResult.status || 'SENT_OFFLINE',
    ackLevel: sendResult.ack || 1,
    waMessageId: sendResult.wa_message_id || null,
    errorMessage: null,
    botDisconnected: false
  };
}

function recomputeBatchSummary(db, batchId) {
  const summary = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN ack_level >= 1 THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN ack_level = 2 THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN ack_level >= 3 THEN 1 ELSE 0 END) as read_count,
      SUM(CASE WHEN status = 'SENT_OFFLINE' THEN 1 ELSE 0 END) as offline,
      SUM(CASE WHEN status = 'NOT_ON_WHATSAPP' THEN 1 ELSE 0 END) as not_on_wa,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
    FROM fee_pulse_logs
    WHERE batch_id = ?
  `).get(batchId) || {};

  db.prepare(`
    UPDATE fee_pulse_batches
    SET total_sent = ?,
        total_delivered = ?,
        total_read = ?,
        total_offline = ?,
        total_not_on_wa = ?,
        total_failed = ?,
        status = 'completed',
        completed_at = datetime('now')
    WHERE id = ?
  `).run(
    summary.sent || 0,
    summary.delivered || 0,
    summary.read_count || 0,
    summary.offline || 0,
    summary.not_on_wa || 0,
    summary.failed || 0,
    batchId
  );

  return summary;
}

function createFeePulseService({
  getDb,
  pulseBot,
  getMainWindow = () => null,
  getSchoolName = () => 'Nexus School',
  rateLimitMs = 1500
}) {
  let isFeePulseRunning = false;
  let pendingAutoRetry = false;

  const emitToRenderer = (channel, payload) => {
    const win = typeof getMainWindow === 'function' ? getMainWindow() : null;
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  };

  const sleepRateLimit = () =>
    rateLimitMs > 0 ? new Promise((resolve) => setTimeout(resolve, rateLimitMs)) : Promise.resolve();

  function triggerDeferredRetryIfNeeded() {
    if (!pendingAutoRetry) return;
    if (!isBotReadyStatus(pulseBot)) return;
    pendingAutoRetry = false;
    setImmediate(() => {
      retryFailedFeePulseLogs({ reason: 'deferred_bot_ready' }).catch((err) => {
        console.error('[Fee Pulse] Deferred retry error:', err);
      });
    });
  }

  async function runFeePulseBatch({ triggerSource = 'desktop_manual' } = {}) {
    if (isFeePulseRunning) {
      console.warn('[Fee Pulse] Batch is already running. Concurrent trigger prevented.');
      return { ok: false, error: 'A Fee Pulse batch is already in progress.' };
    }

    const db = getDb();
    if (!db) return { ok: false, error: 'Database not initialized.' };

    ensureFeePulseTables(db);
    isFeePulseRunning = true;

    try {
      const termConfig = db.prepare('SELECT * FROM school_term_config WHERE id = 1').get() || {
        academic_session: '2025/2026',
        term: 'First Term'
      };
      const session = termConfig.academic_session;
      const term = termConfig.term;

      // 1. Query debtors with net positive balance
      const allDebtors = db.prepare(`
        SELECT s.id as student_id, s.name, s.class_name, s.class_arm, s.parent_phone, f.total_billed, f.total_paid
        FROM students s
        JOIN student_fees f ON s.id = f.student_id
        WHERE f.academic_session = ? AND f.term = ?
          AND (f.total_billed - f.total_paid) > 0
          AND s.parent_phone IS NOT NULL AND TRIM(s.parent_phone) != ''
          AND COALESCE(s.is_active, 1) = 1
      `).all(session, term);

      // 2. Idempotency Guard: 24h cooldown (FAILED rows never block re-delivery)
      const recentSentRows = db.prepare(`
        SELECT DISTINCT l.student_id
        FROM fee_pulse_logs l
        JOIN fee_pulse_batches b ON l.batch_id = b.id
        WHERE b.academic_session = ? AND b.term = ?
          AND l.dispatched_at > datetime('now', '-24 hours')
          AND COALESCE(l.status, '') != 'FAILED'
      `).all(session, term);
      const recentlyRemindedIds = new Set(recentSentRows.map((r) => r.student_id));

      const eligibleDebtors = allDebtors.filter((d) => !recentlyRemindedIds.has(d.student_id));

      if (eligibleDebtors.length === 0) {
        console.log(`[Fee Pulse] No debtors to remind (Total debtors: ${allDebtors.length}, already reminded in last 24h: ${recentlyRemindedIds.size})`);
        emitToRenderer('fee-reminders-complete', {
          batchId: null,
          total: allDebtors.length,
          sent: 0,
          delivered: 0,
          offline: 0,
          notOnWa: 0,
          failed: 0,
          alreadyReminded: recentlyRemindedIds.size,
          duration: 0
        });
        emitToRenderer('fee-reminders-sent', { count: 0 });
        return { ok: true, count: 0, message: 'All debtors were already reminded within the last 24 hours.' };
      }

      // 3. Create batch record
      const batchId = `fp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const totalDebtTargeted = eligibleDebtors.reduce((sum, d) => sum + (d.total_billed - d.total_paid), 0);

      db.prepare(`
        INSERT INTO fee_pulse_batches (
          id, academic_session, term, trigger_source, total_targeted, total_debt_targeted, status, started_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'in_progress', datetime('now'))
      `).run(batchId, session, term, triggerSource, eligibleDebtors.length, totalDebtTargeted);

      const schoolName = getSchoolName() || 'Nexus School';
      const totalCount = eligibleDebtors.length;
      const startTime = Date.now();

      console.log(`[Fee Pulse] Starting batch ${batchId} for ${totalCount} debtors (${triggerSource})...`);

      const insertLogStmt = db.prepare(`
        INSERT INTO fee_pulse_logs (
          id, batch_id, student_id, student_name, class_name, parent_phone,
          original_balance, wa_message_id, ack_level, status, retry_count, error_message,
          dispatched_at, delivered_at, read_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'),
          CASE WHEN ? = 'DELIVERED' THEN datetime('now') ELSE NULL END,
          CASE WHEN ? = 'READ' THEN datetime('now') ELSE NULL END
        )
      `);

      // 4. Dispatch loop with rate-limiting & progress emissions
      for (let i = 0; i < totalCount; i++) {
        const debtor = eligibleDebtors[i];
        const balance = Math.max(0, debtor.total_billed - debtor.total_paid);
        const studentClass = debtor.class_name + (debtor.class_arm ? ' ' + debtor.class_arm : '');
        const logId = `log_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;

        const result = await dispatchSingleFeeReminder({
          pulseBot,
          schoolName,
          studentName: debtor.name,
          parentPhone: debtor.parent_phone,
          balance
        });

        insertLogStmt.run(
          logId,
          batchId,
          debtor.student_id,
          debtor.name,
          studentClass,
          debtor.parent_phone,
          balance,
          result.waMessageId,
          result.ackLevel,
          result.logStatus,
          result.errorMessage,
          result.logStatus,
          result.logStatus
        );

        emitToRenderer('fee-reminders-progress', {
          batchId,
          current: i + 1,
          total: totalCount,
          percentage: Math.round(((i + 1) / totalCount) * 100),
          studentName: debtor.name,
          status: result.logStatus
        });

        // Skip rate-limit sleep when the bot is disconnected so offline batches
        // record immediately without holding the execution lock for minutes.
        if (i < totalCount - 1 && !result.botDisconnected) {
          await sleepRateLimit();
        }
      }

      // 5. Finalize batch summary in SQLite
      const summary = recomputeBatchSummary(db, batchId);
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`[Fee Pulse] Batch ${batchId} complete in ${duration}s: ${summary.sent} sent, ${summary.offline} offline, ${summary.not_on_wa} not on WA, ${summary.failed} failed.`);

      const completePayload = {
        batchId,
        total: totalCount,
        sent: summary.sent || 0,
        delivered: summary.delivered || 0,
        read: summary.read_count || 0,
        offline: summary.offline || 0,
        notOnWa: summary.not_on_wa || 0,
        failed: summary.failed || 0,
        duration
      };

      emitToRenderer('fee-reminders-complete', completePayload);
      emitToRenderer('fee-reminders-sent', { count: summary.sent || 0 });

      return { ok: true, ...completePayload };
    } catch (err) {
      console.error('[Fee Pulse] Batch execution error:', err);
      emitToRenderer('fee-reminders-complete', { error: err.message });
      return { ok: false, error: err.message };
    } finally {
      isFeePulseRunning = false;
      triggerDeferredRetryIfNeeded();
    }
  }

  function queryRetryCandidates(db, { batchId, maxAgeHours, maxAutoRetries }) {
    if (batchId) {
      return db.prepare(`
        SELECT
          l.id AS log_id, l.batch_id, l.student_id, l.student_name, l.class_name,
          l.parent_phone AS log_parent_phone, l.original_balance, l.retry_count,
          l.dispatched_at, b.academic_session, b.term,
          s.name AS live_student_name, s.parent_phone AS live_parent_phone,
          COALESCE(s.is_active, 1) AS is_active,
          f.total_billed, f.total_paid
        FROM fee_pulse_logs l
        JOIN fee_pulse_batches b ON l.batch_id = b.id
        LEFT JOIN students s ON s.id = l.student_id
        LEFT JOIN student_fees f ON f.student_id = l.student_id
          AND f.academic_session = b.academic_session
          AND f.term = b.term
        WHERE l.status = 'FAILED'
          AND l.batch_id = ?
        ORDER BY l.dispatched_at ASC, l.id ASC
      `).all(batchId);
    }

    const windowModifier = `-${Math.max(1, Number(maxAgeHours) || 24)} hours`;
    const rows = db.prepare(`
      SELECT
        l.id AS log_id, l.batch_id, l.student_id, l.student_name, l.class_name,
        l.parent_phone AS log_parent_phone, l.original_balance, l.retry_count,
        l.dispatched_at, b.academic_session, b.term,
        s.name AS live_student_name, s.parent_phone AS live_parent_phone,
        COALESCE(s.is_active, 1) AS is_active,
        f.total_billed, f.total_paid
      FROM fee_pulse_logs l
      JOIN fee_pulse_batches b ON l.batch_id = b.id
      LEFT JOIN students s ON s.id = l.student_id
      LEFT JOIN student_fees f ON f.student_id = l.student_id
        AND f.academic_session = b.academic_session
        AND f.term = b.term
      WHERE l.status = 'FAILED'
        AND l.dispatched_at > datetime('now', ?)
        AND COALESCE(l.retry_count, 0) < ?
        AND NOT EXISTS (
          SELECT 1
          FROM fee_pulse_logs l2
          JOIN fee_pulse_batches b2 ON l2.batch_id = b2.id
          WHERE l2.student_id = l.student_id
            AND b2.academic_session = b.academic_session
            AND b2.term = b.term
            AND l2.dispatched_at > datetime('now', ?)
            AND COALESCE(l2.status, '') != 'FAILED'
        )
      ORDER BY l.dispatched_at DESC, l.id DESC
    `).all(windowModifier, maxAutoRetries, windowModifier);

    // Deduplicate multiple failed attempts for the same student/term, keeping the newest row.
    const seen = new Set();
    const deduped = [];
    for (const row of rows) {
      const key = `${row.academic_session}::${row.term}::${row.student_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
    }
    return deduped.reverse();
  }

  async function retryFailedFeePulseLogs({
    batchId = null,
    maxAgeHours = 24,
    maxAutoRetries = 3,
    reason = 'bot_ready'
  } = {}) {
    const isManual = Boolean(batchId);

    if (isFeePulseRunning) {
      if (!isManual) {
        pendingAutoRetry = true;
        console.log('[Fee Pulse Retry] Batch runner is currently active — deferring retry until idle.');
        return { ok: true, deferred: true, retried: 0 };
      }
      return { ok: false, error: 'A Fee Pulse batch is already in progress.' };
    }

    const db = getDb();
    if (!db) return { ok: false, error: 'Database not initialized.' };

    ensureFeePulseTables(db);

    if (!isBotReadyStatus(pulseBot)) {
      return { ok: false, error: 'WhatsApp bot is not connected. Please start the bot first.' };
    }

    isFeePulseRunning = true;

    try {
      const candidates = queryRetryCandidates(db, { batchId, maxAgeHours, maxAutoRetries });

      if (candidates.length === 0) {
        return {
          ok: true,
          batchId,
          total: 0,
          sent: 0,
          delivered: 0,
          read: 0,
          offline: 0,
          notOnWa: 0,
          failed: 0,
          cleared: 0,
          isRetry: true,
          duration: 0
        };
      }

      const schoolName = getSchoolName() || 'Nexus School';
      const totalCount = candidates.length;
      const startTime = Date.now();
      const affectedBatchIds = new Set();

      let sentCount = 0;
      let deliveredCount = 0;
      let readCount = 0;
      let offlineCount = 0;
      let notOnWaCount = 0;
      let failedCount = 0;
      let clearedCount = 0;
      let abortedDisconnected = false;
      let processedCount = 0;

      console.log(`[Fee Pulse Retry] Retrying ${totalCount} failed log(s) (reason=${reason}, batchId=${batchId || 'all_recent'})...`);

      const markClearedStmt = db.prepare(`
        UPDATE fee_pulse_logs
        SET status = 'CLEARED',
            ack_level = 0,
            error_message = NULL,
            dispatched_at = datetime('now')
        WHERE id = ?
      `);

      const markSuccessStmt = db.prepare(`
        UPDATE fee_pulse_logs
        SET parent_phone = ?,
            wa_message_id = ?,
            ack_level = ?,
            status = ?,
            error_message = NULL,
            dispatched_at = datetime('now'),
            delivered_at = CASE WHEN ? = 'DELIVERED' THEN COALESCE(delivered_at, datetime('now')) ELSE delivered_at END,
            read_at = CASE WHEN ? = 'READ' THEN COALESCE(read_at, datetime('now')) ELSE read_at END
        WHERE id = ?
      `);

      const markNotOnWaStmt = db.prepare(`
        UPDATE fee_pulse_logs
        SET parent_phone = ?,
            wa_message_id = NULL,
            ack_level = -2,
            status = 'NOT_ON_WHATSAPP',
            error_message = ?,
            dispatched_at = datetime('now')
        WHERE id = ?
      `);

      const markFailedStmt = db.prepare(`
        UPDATE fee_pulse_logs
        SET parent_phone = ?,
            ack_level = -1,
            status = 'FAILED',
            retry_count = COALESCE(retry_count, 0) + 1,
            error_message = ?,
            dispatched_at = datetime('now')
        WHERE id = ?
      `);

      const markDisconnectStmt = db.prepare(`
        UPDATE fee_pulse_logs
        SET error_message = ?
        WHERE id = ?
      `);

      for (let i = 0; i < totalCount; i++) {
        const row = candidates[i];
        const studentName = row.live_student_name || row.student_name;
        const phone = (row.live_parent_phone && String(row.live_parent_phone).trim())
          ? String(row.live_parent_phone).trim()
          : String(row.log_parent_phone || '').trim();

        const liveBalance = row.total_billed != null
          ? Math.max(0, Number(row.total_billed || 0) - Number(row.total_paid || 0))
          : 0;

        affectedBatchIds.add(row.batch_id);

        if (!row.is_active || liveBalance <= 0) {
          markClearedStmt.run(row.log_id);
          clearedCount++;
          processedCount++;
          emitToRenderer('fee-reminders-progress', {
            batchId: row.batch_id,
            current: i + 1,
            total: totalCount,
            percentage: Math.round(((i + 1) / totalCount) * 100),
            studentName,
            status: 'CLEARED',
            isRetry: true
          });
          continue;
        }

        if (!phone) {
          markFailedStmt.run(row.log_parent_phone || '', 'Missing parent phone number', row.log_id);
          failedCount++;
          processedCount++;
          emitToRenderer('fee-reminders-progress', {
            batchId: row.batch_id,
            current: i + 1,
            total: totalCount,
            percentage: Math.round(((i + 1) / totalCount) * 100),
            studentName,
            status: 'FAILED',
            isRetry: true
          });
          continue;
        }

        const result = await dispatchSingleFeeReminder({
          pulseBot,
          schoolName,
          studentName,
          parentPhone: phone,
          balance: liveBalance
        });

        if (result.botDisconnected) {
          markDisconnectStmt.run(result.errorMessage, row.log_id);
          abortedDisconnected = true;
          console.warn(`[Fee Pulse Retry] Bot disconnected mid-retry at ${i + 1}/${totalCount} — remaining items stay FAILED for next ready event.`);
          break;
        }

        processedCount++;

        if (result.ok) {
          markSuccessStmt.run(
            phone,
            result.waMessageId,
            result.ackLevel,
            result.logStatus,
            result.logStatus,
            result.logStatus,
            row.log_id
          );
          sentCount++;
          if (result.logStatus === 'READ') readCount++;
          else if (result.logStatus === 'DELIVERED') deliveredCount++;
          else offlineCount++;
        } else if (result.logStatus === 'NOT_ON_WHATSAPP') {
          markNotOnWaStmt.run(phone, result.errorMessage, row.log_id);
          notOnWaCount++;
        } else {
          markFailedStmt.run(phone, result.errorMessage, row.log_id);
          failedCount++;
        }

        emitToRenderer('fee-reminders-progress', {
          batchId: row.batch_id,
          current: i + 1,
          total: totalCount,
          percentage: Math.round(((i + 1) / totalCount) * 100),
          studentName,
          status: result.logStatus,
          isRetry: true
        });

        if (i < totalCount - 1) {
          await sleepRateLimit();
        }
      }

      for (const bId of affectedBatchIds) {
        recomputeBatchSummary(db, bId);
      }

      const untouchedFailed = totalCount - processedCount;
      const totalFailedAfter = failedCount + untouchedFailed;
      const duration = Math.round((Date.now() - startTime) / 1000);
      const primaryBatchId = batchId || [...affectedBatchIds][0] || null;

      console.log(
        `[Fee Pulse Retry] Complete in ${duration}s: ${sentCount} sent, ${clearedCount} cleared, ${notOnWaCount} not on WA, ${totalFailedAfter} failed.`
      );

      const summaryPayload = {
        batchId: primaryBatchId,
        affectedBatchIds: [...affectedBatchIds],
        total: totalCount,
        sent: sentCount,
        delivered: deliveredCount,
        read: readCount,
        offline: offlineCount,
        notOnWa: notOnWaCount,
        failed: totalFailedAfter,
        cleared: clearedCount,
        isRetry: true,
        abortedDisconnected,
        duration
      };

      if (abortedDisconnected && processedCount === 0) {
        emitToRenderer('fee-reminders-complete', {
          ...summaryPayload,
          error: 'WhatsApp bot disconnected before retries could complete.'
        });
        return { ok: false, error: 'WhatsApp bot disconnected before retries could complete.', ...summaryPayload };
      }

      emitToRenderer('fee-reminders-complete', summaryPayload);
      return { ok: true, ...summaryPayload };
    } catch (err) {
      console.error('[Fee Pulse Retry] Retry execution error:', err);
      emitToRenderer('fee-reminders-complete', { error: err.message, isRetry: true });
      return { ok: false, error: err.message };
    } finally {
      isFeePulseRunning = false;
    }
  }

  return {
    runFeePulseBatch,
    retryFailedFeePulseLogs,
    isRunning: () => isFeePulseRunning
  };
}

module.exports = {
  ensureFeePulseTables,
  formatFeeReminderMessage,
  isBotDisconnectedError,
  dispatchSingleFeeReminder,
  recomputeBatchSummary,
  createFeePulseService
};
