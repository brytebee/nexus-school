"use strict";

const { database } = require("@nexus/engine");
const { getMatchableDigits } = require("./phone-utils");
const path = require("path");

let syncTimer = null;
let isSyncing = false;
let mainWindowRef = null;
let lastSyncSuccess = null;
let lastSyncError = null;

function getApiBase() {
  return process.env.NEXUS_API_URL || "https://api.nexusos.com.ng";
}

function isCloudEnabled(db) {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'cloud_pulse_enabled'").get();
    return row?.value === 'true';
  } catch (_) {
    return false;
  }
}

function getSchoolId(db) {
  try {
    // 1. Explicit cloud ID set after first successful activation
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'school_cloud_id'").get();
    if (row && row.value) return row.value;

    // 2. Read school_id directly from the license.nexus file on disk
    //    (license_payload is NOT stored in the DB — the file is the source of truth)
    try {
      const { app } = require('electron');
      const fs = require('fs');
      const path = require('path');
      const licensePath = path.join(app.getPath('userData'), 'license.nexus');
      if (fs.existsSync(licensePath)) {
        const raw = fs.readFileSync(licensePath, 'utf8').trim();
        const header = raw.split('.')[0];
        const payload = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
        if (payload.school_id) return payload.school_id;
        if (payload.hardware_id) return payload.hardware_id;
      }
    } catch (_) {}

    // 3. DB fallback — legacy installs that stored license_payload in app_settings
    const licenseRow = db.prepare("SELECT value FROM app_settings WHERE key = 'license_payload'").get();
    if (licenseRow && licenseRow.value) {
      const payload = JSON.parse(licenseRow.value);
      if (payload.school_id) return payload.school_id;
      if (payload.hardware_id) return payload.hardware_id;
    }

    // 4. Final fallback: hardware_id stored in app_settings
    const hwRow = db.prepare("SELECT value FROM app_settings WHERE key = 'hardware_id'").get();
    if (hwRow && hwRow.value) return hwRow.value;
  } catch (_) {}
  return null;
}

function getSyncToken(db) {
  try {
    // 1. Explicit sync token stored in app_settings
    const syncTokenRow = db.prepare("SELECT value FROM app_settings WHERE key = 'nexus_sync_token'").get();
    if (syncTokenRow?.value) return syncTokenRow.value;

    // 2. hardware_id directly in app_settings
    const hwRow = db.prepare("SELECT value FROM app_settings WHERE key = 'hardware_id'").get();
    if (hwRow?.value) return hwRow.value;

    // 3. Return the full signed token from license.nexus — this is the exact
    //    435-char string stored in License.token in PostgreSQL.
    //    verifySyncAuth's (l.token === syncToken) check matches it directly,
    //    requiring no server-side changes.
    try {
      const { app } = require('electron');
      const fs = require('fs');
      const path = require('path');
      const licensePath = path.join(app.getPath('userData'), 'license.nexus');
      if (fs.existsSync(licensePath)) {
        const raw = fs.readFileSync(licensePath, 'utf8').trim();
        if (raw) return raw;
      }
    } catch (_) {}

    // 4. Legacy DB fallback — license_payload key (kept for forward-compat)
    const licenseRow = db.prepare("SELECT value FROM app_settings WHERE key = 'license_payload'").get();
    if (licenseRow?.value) {
      const payload = JSON.parse(licenseRow.value);
      if (payload.hardware_id) return payload.hardware_id;
      if (payload.token) return payload.token;
    }
  } catch (_) {}
  return "nexus_desktop_client";
}

/**
 * 1. Outbound Push: Gathers parent-facing data chunks from local SQLite
 * and pushes to nexus-api /api/sync/push
 */
async function pushSchoolDelta() {
  const db = database.getDb();
  const schoolId = getSchoolId(db);
  if (!schoolId) {
    return { ok: false, reason: "no_school_id" };
  }

  // 1. Gather Students + Fees + Results Summaries + Attendance Stats
  const students = db.prepare(`
    SELECT s.id, s.name, s.class_name, s.class_arm, s.parent_phone,
           COALESCE(sf.total_billed, 0) as total_billed,
           COALESCE(sf.total_paid, 0) as total_paid,
           COALESCE(sf.total_billed - sf.total_paid, 0) as fee_balance
    FROM students s
    LEFT JOIN student_fees sf ON sf.student_id = s.id
    WHERE s.parent_phone IS NOT NULL AND s.parent_phone != ''
  `).all();

  const termConfig = db.prepare("SELECT academic_session, term FROM school_term_config WHERE id = 1").get() || {
    academic_session: "2025/2026",
    term: "First Term"
  };

  const studentPayload = students.map((st) => {
    // Query published result summary for active term
    let resultsSummary = [];
    try {
      resultsSummary = db.prepare(`
        SELECT subject, score, grade, remark
        FROM results
        WHERE student_id = ? AND academic_session = ? AND term = ?
      `).all(st.id, termConfig.academic_session, termConfig.term);
    } catch (_) {}

    // Query attendance summary for active term
    let attendanceStats = { present: 0, total: 0, absent_dates: [] };
    try {
      const attRows = db.prepare(`
        SELECT date, status
        FROM attendance
        WHERE student_id = ? AND academic_session = ? AND term = ?
      `).all(st.id, termConfig.academic_session, termConfig.term);

      const total = attRows.length;
      const present = attRows.filter(r => r.status === "Present").length;
      const absentDates = attRows.filter(r => r.status === "Absent").map(r => r.date);
      attendanceStats = { present, total, absent_dates: absentDates };
    } catch (_) {}

    return {
      id: st.id,
      name: st.name,
      class_name: st.class_name,
      class_arm: st.class_arm,
      parent_phone: st.parent_phone,
      total_billed: st.total_billed,
      total_paid: st.total_paid,
      fee_balance: st.fee_balance,
      results_summary: resultsSummary,
      attendance_stats: attendanceStats
    };
  });

  // 2. Gather Published News
  let newsPayload = [];
  try {
    newsPayload = db.prepare(`
      SELECT title, category, body
      FROM portal_news
      WHERE is_published = 1
      ORDER BY id DESC LIMIT 10
    `).all();
  } catch (_) {}

  // 3. Gather Published Policies
  let policiesPayload = [];
  try {
    policiesPayload = db.prepare(`
      SELECT title, body, order_num
      FROM portal_policies
      WHERE is_published = 1
      ORDER BY order_num ASC, id ASC
    `).all();
  } catch (_) {}

  const syncToken = getSyncToken(db);
  const url = `${getApiBase()}/api/sync/push`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nexus-sync-token": syncToken
    },
    body: JSON.stringify({
      school_id: schoolId,
      delta: {
        students: studentPayload,
        news: newsPayload,
        policies: policiesPayload
      }
    })
  });

  const json = await response.json();
  if (!response.ok || !json.ok) {
    throw new Error(json.error || `Sync push failed with HTTP ${response.status}`);
  }

  return { ok: true, count: studentPayload.length, synced_at: json.synced_at };
}

/**
 * 2. Inbound Pull: Retrieves settled cloud events (Paystack settlements)
 * and reconciles local SQLite tables
 */
async function pullPendingSyncEvents() {
  const db = database.getDb();
  const schoolId = getSchoolId(db);
  if (!schoolId) return { ok: false, reason: "no_school_id" };

  const syncToken = getSyncToken(db);
  const url = `${getApiBase()}/api/sync/pull?school_id=${encodeURIComponent(schoolId)}`;
  const response = await fetch(url, {
    headers: {
      "x-nexus-sync-token": syncToken
    }
  });
  const json = await response.json();

  if (!response.ok || !json.ok) {
    throw new Error(json.error || `Sync pull failed with HTTP ${response.status}`);
  }

  const events = json.events || [];
  const ackIds = [];

  for (const ev of events) {
    if (ev.event_type === "PAYMENT_SETTLED") {
      const { paystack_ref, amount, settled_at } = ev.payload;
      try {
        db.prepare(`
          UPDATE fee_payment_sessions
          SET status = 'settled', settled_at = ?
          WHERE paystack_ref = ?
        `).run(settled_at || new Date().toISOString(), paystack_ref);
        console.log(`[Sync Worker] Reconciled settled payment session: ${paystack_ref}`);
      } catch (err) {
        console.warn(`[Sync Worker] Failed to reconcile payment ${paystack_ref}:`, err.message);
      }
    }
    ackIds.push(ev.id);
  }

  // Acknowledge processed events
  if (ackIds.length > 0) {
    await fetch(`${getApiBase()}/api/sync/ack`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-nexus-sync-token": syncToken
      },
      body: JSON.stringify({ school_id: schoolId, ack_ids: ackIds })
    });
  }

  return { ok: true, processed: ackIds.length };
}

/**
 * 3. Full 2-Way Sync Loop Cycle
 */
async function performSyncCycle() {
  if (isSyncing) return;
  isSyncing = true;
  try {
    // Outbound push
    const pushRes = await pushSchoolDelta();
    // Inbound pull
    const pullRes = await pullPendingSyncEvents();

    lastSyncSuccess = new Date().toISOString();
    lastSyncError = null;

    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send("sync:status", {
        status: "idle",
        lastSync: lastSyncSuccess,
        error: null
      });
    }
    return { ok: true, push: pushRes, pull: pullRes };
  } catch (err) {
    lastSyncError = err.message;
    console.warn("[Sync Worker] Sync cycle warning:", err.message);
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send("sync:status", {
        status: "error",
        lastSync: lastSyncSuccess,
        error: lastSyncError
      });
    }
    return { ok: false, error: err.message };
  } finally {
    isSyncing = false;
  }
}

function initSyncWorker(mainWindow) {
  mainWindowRef = mainWindow;
}

function startSyncSchedule(intervalMs = 5 * 60 * 1000) {
  const db = database.getDb();
  if (!isCloudEnabled(db)) {
    console.log("[Sync Worker] Cloud Pulse is disabled — sync schedule not started.");
    return;
  }

  if (syncTimer) clearInterval(syncTimer);
  // Run first cycle 10 seconds after app startup
  setTimeout(() => {
    performSyncCycle().catch(() => {});
  }, 10000);

  // Background interval every 5 minutes
  syncTimer = setInterval(() => {
    performSyncCycle().catch(() => {});
  }, intervalMs);
}

function stopSyncSchedule() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

async function activateCloud(options = {}) {
  const db = database.getDb();
  const schoolCloudId = options.schoolCloudId || getSchoolId(db);

  if (!schoolCloudId) {
    throw new Error("Cannot activate Cloud Pulse without a valid School Cloud ID.");
  }

  db.prepare(`
    INSERT OR REPLACE INTO app_settings (key, value)
    VALUES ('cloud_pulse_enabled', 'true')
  `).run();

  if (options.schoolCloudId) {
    db.prepare(`
      INSERT OR REPLACE INTO app_settings (key, value)
      VALUES ('school_cloud_id', ?)
    `).run(options.schoolCloudId);
  }

  // Start sync timer
  startSyncSchedule();

  // Run immediate sync cycle
  const result = await performSyncCycle();
  return { ok: true, syncResult: result };
}

async function deactivateCloud() {
  const db = database.getDb();
  db.prepare(`
    INSERT OR REPLACE INTO app_settings (key, value)
    VALUES ('cloud_pulse_enabled', 'false')
  `).run();

  stopSyncSchedule();

  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send("sync:status", {
      status: "disabled",
      lastSync: lastSyncSuccess,
      error: null
    });
  }

  return { ok: true };
}

function getCloudConfig() {
  const db = database.getDb();
  return {
    isEnabled: isCloudEnabled(db),
    schoolCloudId: getSchoolId(db),
    isSyncing,
    lastSyncSuccess,
    lastSyncError
  };
}

function getSyncStatus() {
  return {
    isSyncing,
    lastSyncSuccess,
    lastSyncError
  };
}

module.exports = {
  initSyncWorker,
  pushSchoolDelta,
  pullPendingSyncEvents,
  performSyncCycle,
  startSyncSchedule,
  stopSyncSchedule,
  activateCloud,
  deactivateCloud,
  getCloudConfig,
  getSyncStatus
};
