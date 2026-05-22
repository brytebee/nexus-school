// ═══════════════════════════════════════════════════════════════════════════════
// Nexus Pulse Bot — Stateful Conversation Engine
// ═══════════════════════════════════════════════════════════════════════════════
"use strict";

const { Client, LocalAuth } = require("whatsapp-web.js");
const { database } = require("@nexus/engine");
const path = require("path");
const os   = require("os");
const fs   = require("fs");
const QRCode = require("qrcode");

// Suppress Puppeteer "Execution context was destroyed" noise that fires
// when WhatsApp LOGOUT causes a page navigation mid-inject. This is expected
// and harmless — the bot self-recovers by clearing the stale auth.
process.on("unhandledRejection", (reason) => {
  if (reason?.message?.includes("Execution context was destroyed")) return;
  if (reason?.message?.includes("Session closed")) return;
  console.error("[Pulse Bot] Unhandled rejection:", reason);
});

// ─── Module-level WA client state ─────────────────────────────────────────────
let client          = null;
let mainWindowRef   = null;
let isReady         = false;
let qrCodeData      = null;
let _authPath       = null; // set when startPulse() runs
let _initInProgress = false; // true while client.initialize() is pending

// ─── Conversation Session Manager ─────────────────────────────────────────────
// Key: last-10-digit phone string  |  Value: Session object
const sessions = new Map();
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes inactivity

// ─── JID → Phone Resolution Cache ─────────────────────────────────────────────
// Keyed by raw JID string (msg.from). Avoids re-running the 4-strategy async
// resolution (200 ms – 5 s) on every subsequent message from the same contact.
// Lives for the lifetime of the bot session — cleared on destroyPulse().
const _jidPhoneCache = new Map();

const STATE = Object.freeze({
  MENU:            "MENU",
  SCOPE:           "SCOPE",
  TERM_SELECT:     "TERM_SELECT",
  AWAITING_RECEIPT:"AWAITING_RECEIPT",
});

function createSession(students, termConfig, schoolName) {
  return {
    state: STATE.MENU,
    students,
    termConfig,
    schoolName,
    menuChoice: null, // 'result' | 'attendance' | 'fees'
    scope: null,      // 'term' | 'year' | 'specific'
    timeoutId: null,
  };
}

function getSession(key) {
  return sessions.get(key) ?? null;
}

function setSession(key, session) {
  _clearTimeout(key);
  session.timeoutId = setTimeout(() => sessions.delete(key), SESSION_TTL_MS);
  sessions.set(key, session);
}

function clearSession(key) {
  _clearTimeout(key);
  sessions.delete(key);
}

function _clearTimeout(key) {
  const existing = sessions.get(key);
  if (existing?.timeoutId) clearTimeout(existing.timeoutId);
}

// ─── WhatsApp Client Lifecycle ─────────────────────────────────────────────────
function initPulseBot(mainWindow) {
  mainWindowRef = mainWindow;
}

function sendStatus(status, data = null) {
  if (mainWindowRef) {
    mainWindowRef.webContents.send("pulse-status", { status, data });
  }
}

async function startPulse() {
  if (client) {
    console.log("[Pulse Bot] Client already exists. Returning current state.");
    if (qrCodeData && !isReady) sendStatus("qr", qrCodeData);
    else if (isReady) sendStatus("ready");
    return;
  }

  console.log("[Pulse Bot] Starting...");
  sendStatus("starting");

  // ── Resolve Chromium path for packaged Electron app ───────────────────────
  // Puppeteer's bundled Chromium path changes when asar-packed.
  // Priority: system Chrome → Puppeteer bundled → let Puppeteer auto-detect.
  function resolveChromiumPath() {
    const { app } = require("electron");

    // System Chrome paths by platform
    const systemPaths = {
      darwin: [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
      ],
      win32: [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      ],
      linux: [
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
      ],
    };

    const candidates = systemPaths[process.platform] ?? [];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        console.log(`[Pulse Bot] Using system Chrome: ${p}`);
        return p;
      }
    }

    // Puppeteer bundled Chromium — path differs between dev and packaged
    try {
      const puppeteer = require("puppeteer");
      const chromePath = puppeteer.executablePath();
      if (chromePath && fs.existsSync(chromePath)) {
        console.log(`[Pulse Bot] Using Puppeteer Chromium: ${chromePath}`);
        return chromePath;
      }
    } catch (_) {}

    console.warn("[Pulse Bot] No Chromium found — Puppeteer will auto-detect (may fail if packaged).");
    return undefined;
  }

  const chromiumPath = resolveChromiumPath();

  _authPath = path.join(os.homedir(), ".nexus_pulse_auth");
  try {
    client = new Client({
      authStrategy: new LocalAuth({ dataPath: _authPath }),
      puppeteer: {
        headless: true,
        executablePath: chromiumPath,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      },
    });

    client.on("qr", async (qr) => {
      console.log("[Pulse Bot] QR RECEIVED");
      try {
        const qrDataUrl = await QRCode.toDataURL(qr);
        qrCodeData = qrDataUrl;
        isReady = false;
        sendStatus("qr", qrDataUrl);
      } catch (err) {
        console.error("[Pulse Bot] Failed to generate QR data URL:", err);
      }
    });

    client.on("ready", () => {
      console.log("[Pulse Bot] Client is ready!");
      isReady = true;
      qrCodeData = null;
      sendStatus("ready");
    });

    client.on("authenticated", () => {
      console.log("[Pulse Bot] Authenticated");
      sendStatus("authenticated");
    });

    client.on("auth_failure", (reason) => {
      console.error("[Pulse Bot] Authentication failure", reason);
      sendStatus("error", "Authentication failed. Please restart the bot.");
      destroyPulse();
    });

    client.on("disconnected", (reason) => {
      console.log("[Pulse Bot] Disconnected:", reason);
      const userMsg = reason === "LOGOUT"
        ? "WhatsApp session was logged out. Click \"Start Bot\" to scan a fresh QR."
        : null;
      sendStatus("disconnected", userMsg);

      if (reason === "LOGOUT" && _authPath) {
        // Clear the stale LocalAuth folder so next start shows a fresh QR
        try {
          if (fs.existsSync(_authPath)) {
            fs.rmSync(_authPath, { recursive: true, force: true });
            console.log("[Pulse Bot] Stale auth session cleared — next start will show QR.");
          }
        } catch (clearErr) {
          console.error("[Pulse Bot] Could not clear stale auth:", clearErr.message);
        }
      }

      // Delay destroy so client.initialize() can settle before Puppeteer tears down
      const delay = _initInProgress ? 3000 : 0;
      setTimeout(() => destroyPulse(), delay);
    });

    client.on("message", async (msg) => {
      try {
        await handleMessage(msg);
      } catch (err) {
        console.error("[Pulse Bot] Unhandled error in handleMessage:", err);
      }
    });

    _initInProgress = true;
    try {
      await client.initialize();
    } finally {
      _initInProgress = false;
    }
  } catch (err) {
    _initInProgress = false;
    // Suppress context-destroyed noise from LOGOUT — handled by disconnected event
    if (!err?.message?.includes("Execution context was destroyed") &&
        !err?.message?.includes("Session closed")) {
      console.error("[Pulse Bot] Failed to initialize:", err);
      sendStatus("error", err.message);
    }
    destroyPulse();
  }
}

async function destroyPulse() {
  if (client) {
    try { await client.destroy(); } catch (e) {
      console.error("[Pulse Bot] Error destroying client", e);
    }
    client = null;
  }
  isReady = false;
  qrCodeData = null;
  _jidPhoneCache.clear(); // Flush the resolution cache on disconnect
  sendStatus("disconnected");
}

// ─── Phone Number Resolution ───────────────────────────────────────────────────
// whatsapp-web.js LIDs (Linked Device IDs) look like long numbers starting with
// 5, 6, or 7 (e.g., 66267268534294). We detect and reject these in favour of
// the actual E.164 phone number via multiple fallback strategies.
//
// Results are cached by JID so returning contacts resolve instantly (O(1))
// instead of paying the 200 ms – 5 s puppeteer IPC cost on every message.

async function resolvePhoneNumber(msg) {
  // ── Fast path: cache hit ──────────────────────────────────────────────────
  const cached = _jidPhoneCache.get(msg.from);
  if (cached) {
    console.log(`[Pulse Bot] Phone resolved via cache for JID: ${msg.from}`);
    return cached;
  }

  try {
    const contact = await msg.getContact();
    console.log(`[Pulse Bot] Raw JID: ${msg.from} | contact.number: ${contact.number}`);

    let resolved = null;

    // Strategy 1: Contact's own number field (most reliable)
    if (!resolved && contact.number && isLikelyPhone(contact.number)) {
      console.log("[Pulse Bot] Phone resolved via contact.number");
      resolved = contact.number;
    }

    // Strategy 2: contact.id._serialized stripped of @c.us and device suffix
    if (!resolved) {
      const serialized = contact.id?._serialized ?? "";
      if (serialized.includes("@c.us")) {
        const extracted = serialized.split("@")[0].split(":")[0];
        if (isLikelyPhone(extracted)) {
          console.log("[Pulse Bot] Phone resolved via contact.id._serialized");
          resolved = extracted;
        }
      }
    }

    // Strategy 3: client.getNumberId lookup (resolves LID → real number)
    if (!resolved && client) {
      const lid = msg.from.split("@")[0].split(":")[0];
      try {
        const wid = await client.getNumberId(lid);
        if (wid) {
          const r = wid._serialized.split("@")[0];
          if (isLikelyPhone(r)) {
            console.log("[Pulse Bot] Phone resolved via getNumberId");
            resolved = r;
          }
        }
      } catch (lidErr) {
        console.warn("[Pulse Bot] getNumberId failed:", lidErr.message);
      }
    }

    // Strategy 4: Parse directly from msg.from JID
    if (!resolved && msg.from.includes("@c.us")) {
      const fromPhone = msg.from.split("@")[0].split(":")[0];
      if (isLikelyPhone(fromPhone)) {
        console.log("[Pulse Bot] Phone resolved via msg.from JID");
        resolved = fromPhone;
      }
    }

    if (!resolved) {
      console.warn("[Pulse Bot] All resolution strategies exhausted.", {
        from: msg.from, number: contact.number,
      });
      return null;
    }

    // ── Cache the resolved phone so future messages from this JID are instant
    _jidPhoneCache.set(msg.from, resolved);
    return resolved;

  } catch (err) {
    console.error("[Pulse Bot] resolvePhoneNumber failed:", err);
    return null;
  }
}

/**
 * Rejects LID values (14-digit numbers starting with 5/6/7/8/9) and accepts
 * valid E.164 numbers or Nigerian-formatted local numbers.
 */
function isLikelyPhone(value) {
  if (!value) return false;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return false;
  // Reject LIDs — they're typically 14 digits starting with a high digit
  if (digits.length >= 13 && /^[56789]/.test(digits)) return false;
  const intl = digits.startsWith("234") && digits.length === 13;
  const local = digits.startsWith("0") && digits.length === 11;
  const bare = digits.length === 10;
  return intl || local || bare;
}

/**
 * Reduces any phone format to the last 10 significant digits for DB matching:
 *   +2347066324306  → 7066324306
 *    07066324306    → 7066324306
 *      7066324306   → 7066324306
 */
function getMatchableDigits(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

// ─── Formatting Helpers ────────────────────────────────────────────────────────
const DIV = "━━━━━━━━━━━━━━━━━━━━";

function gradeColor(score) {
  if (score >= 70) return "🟢";
  if (score >= 60) return "🟡";
  if (score >= 50) return "🟠";
  return "🔴";
}

function gradeLetter(avg) {
  if (avg >= 70) return "A";
  if (avg >= 60) return "B";
  if (avg >= 50) return "C";
  if (avg >= 45) return "D";
  return "F";
}

function attendanceEmoji(pct) {
  if (pct === null) return "⚪";
  if (pct >= 75) return "🟢";
  if (pct >= 50) return "🟡";
  return "🔴";
}

function formatDate(dateStr) {
  // Expects YYYY-MM-DD. Formats to e.g. "Mon, 05 Jan"
  if (!dateStr) return dateStr;
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-NG", { weekday: "short", day: "2-digit", month: "short" });
  } catch {
    return dateStr;
  }
}

// ─── Menu Builders ─────────────────────────────────────────────────────────────
function buildMainMenu(schoolName) {
  return (
    `🎓 *${schoolName} — Parent Portal*\n${DIV}\n` +
    `Hello! How can I help you today?\n\n` +
    `*1.* 📊 Academic Results\n` +
    `*2.* 📅 Attendance Record\n` +
    `*3.* 💳 Fee Status\n\n` +
    `_Reply with 1, 2, or 3._`
  );
}

function buildScopeMenu(menuChoice, termConfig) {
  const icons = { result: "📊", attendance: "📅", fees: "💳" };
  const labels = { result: "Results", attendance: "Attendance", fees: "Fee Status" };
  return (
    `${icons[menuChoice]} *${labels[menuChoice]} — Select Period*\n${DIV}\n` +
    `*1.* Current Term _(${termConfig.term}, ${termConfig.academic_session})_\n` +
    `*2.* Full Academic Year _(${termConfig.academic_session})_\n` +
    `*3.* Choose a specific term\n\n` +
    `_Reply with 1, 2, or 3._`
  );
}

function buildTermMenu() {
  return (
    `📅 *Select Term*\n${DIV}\n` +
    `*1.* First Term\n` +
    `*2.* Second Term\n` +
    `*3.* Third Term\n\n` +
    `_Reply with 1, 2, or 3._`
  );
}

// ─── Data Fetchers ─────────────────────────────────────────────────────────────
function queryResults(db, studentId, academicSession, term) {
  if (term) {
    return db.prepare(
      "SELECT subject, score FROM student_records WHERE student_id=? AND academic_session=? AND term=? ORDER BY subject"
    ).all(studentId, academicSession, term);
  }
  // Full year: include term column
  return db.prepare(
    "SELECT subject, score, term FROM student_records WHERE student_id=? AND academic_session=? ORDER BY term, subject"
  ).all(studentId, academicSession);
}

function queryAttendance(db, studentId, academicSession, term) {
  const base = "FROM daily_attendance WHERE student_id=? AND academic_session=?";
  const termClause = term ? " AND term=?" : "";
  const args = term ? [studentId, academicSession, term] : [studentId, academicSession];

  const present = db.prepare(`SELECT COUNT(*) as c ${base}${termClause} AND status='Present'`).get(...args).c;
  const total   = db.prepare(`SELECT COUNT(*) as c ${base}${termClause}`).get(...args).c;

  // Fetch absent dates for the report
  const absentRows = db.prepare(
    `SELECT date, term ${base}${termClause} AND status='Absent' ORDER BY date`
  ).all(...args);

  let tier = process.env.DEV_MOCK_TIER || "Gold";
  try {
    const s = db.prepare("SELECT value FROM app_settings WHERE key='license_payload'").get();
    if (s) tier = JSON.parse(s.value).tier;
  } catch(e) {}

  let subjectAggRows = [];
  if (tier === "Diamond") {
     const subBase = "FROM subject_attendance_agg WHERE student_id=? AND academic_session=?";
     subjectAggRows = db.prepare(
       `SELECT subject_name, total_classes, classes_attended, term ${subBase}${termClause} ORDER BY subject_name`
     ).all(...args);
  }

  return { present, total, absentRows, subjectAggRows, tier };
}

// ─── Fee Gate Config (mirrors main.js isStudentFeeGated) ──────────────────────
function _getPulseFeeGateConfig(db) {
  try {
    const raw = db.prepare("SELECT value FROM app_settings WHERE key = 'fee_settings'").get()?.value;
    const s = raw ? JSON.parse(raw) : {};
    return {
      enabled:   s.fee_gate_enabled !== false,
      mode:      s.fee_gate_mode      || 'fixed',
      threshold: Number(s.fee_gate_threshold) || 0,
    };
  } catch { return { enabled: true, mode: 'fixed', threshold: 0 }; }
}

function _isPulseFeeGated(db, studentId, session, termOrNull) {
  const cfg = _getPulseFeeGateConfig(db);
  if (!cfg.enabled) return { gated: false, balance: 0 };
  const balRow = termOrNull
    ? db.prepare(`SELECT COALESCE(SUM(total_billed-total_paid),0) AS bal FROM student_fees WHERE student_id=? AND academic_session=? AND term=?`).get(studentId, session, termOrNull)
    : db.prepare(`SELECT COALESCE(SUM(total_billed-total_paid),0) AS bal FROM student_fees WHERE student_id=? AND academic_session=?`).get(studentId, session);
  const balance = balRow?.bal || 0;
  if (balance <= 0) return { gated: false, balance: 0 };
  if (cfg.mode === 'percent') {
    const billedRow = db.prepare(`SELECT COALESCE(SUM(total_billed),0) AS b FROM student_fees WHERE student_id=? AND academic_session=?`).get(studentId, session);
    const b = billedRow?.b || 0;
    return { gated: b > 0 && (balance / b * 100) >= cfg.threshold, balance };
  }
  return { gated: cfg.threshold === 0 ? balance > 0 : balance >= cfg.threshold, balance };
}

// ─── Response Builders ─────────────────────────────────────────────────────────
async function sendResults(msg, session, termOverride = null) {
  const db = database.getDb();
  const { students, termConfig, scope } = session;
  const activeTerm = termOverride ?? termConfig.term;
  const periodLabel = scope === "year"
    ? `Full Year ${termConfig.academic_session}`
    : `${activeTerm}, ${termConfig.academic_session}`;

  let text = `📊 *Academic Results*\n_Period: ${periodLabel}_\n${DIV}\n\n`;

  for (const student of students) {
    // ── Fee Gate (Gold / Diamond only — Silver is exempt) ──────────────────
    let tier = 'Gold';
    try {
      const s = db.prepare("SELECT value FROM app_settings WHERE key='license_payload'").get();
      if (s) tier = JSON.parse(s.value).tier || 'Gold';
    } catch(e) {}
    if (tier !== 'Silver') {
      try {
        // year scope = check ALL terms; otherwise check active term only
        const termForGate = scope === 'year' ? null : activeTerm;
        const gate = _isPulseFeeGated(db, student.id, termConfig.academic_session, termForGate);
        if (gate.gated) {
          const fmt = (n) => Number(n||0).toLocaleString('en-NG', {minimumFractionDigits:0});
          text += `👤 *${student.name}* — ${student.class_name}\n`;
          text += `🔒 *Results Withheld — Outstanding Fee Balance*\n`;
          text += `   Balance: *\u20a6${fmt(gate.balance)}*\n`;
          text += `Please contact the school bursar to clear fees and unlock your results.\n\n`;
          continue;
        }
      } catch(feeErr) {
        console.warn('[Pulse] Fee gate check failed (non-fatal):', feeErr.message);
      }
    }
    const records = queryResults(db, student.id, termConfig.academic_session, scope === "year" ? null : activeTerm);

    text += `👤 *${student.name}*\n🏫 ${student.class_name}\n`;

    if (records.length === 0) {
      text += `_No results available for this period._\n\n`;
      continue;
    }

    if (scope === "year") {
      // Group by term
      const byTerm = records.reduce((acc, r) => {
        (acc[r.term] = acc[r.term] || []).push(r);
        return acc;
      }, {});
      for (const [term, recs] of Object.entries(byTerm)) {
        text += `\n_${term}_\n`;
        let total = 0;
        for (const r of recs) {
          text += `${gradeColor(r.score)} ${r.subject}: *${r.score}%*\n`;
          total += r.score;
        }
        const avg = total / recs.length;
        text += `📈 *Avg: ${avg.toFixed(1)}%* — Grade *${gradeLetter(avg)}*\n`;
      }
    } else {
      let total = 0;
      for (const r of records) {
        text += `${gradeColor(r.score)} ${r.subject}: *${r.score}%*\n`;
        total += r.score;
      }
      const avg = total / records.length;
      text += `\n📈 *Average: ${avg.toFixed(1)}%* — Grade *${gradeLetter(avg)}*\n`;
    }

    text += `\n`;
  }

  text += `${DIV}\n_Powered by Nexus Pulse_ 🎓`;
  await msg.reply(text);
}

async function sendAttendance(msg, session, termOverride = null) {
  const db = database.getDb();
  const { students, termConfig, scope } = session;
  const activeTerm = termOverride ?? termConfig.term;
  const periodLabel = scope === "year"
    ? `Full Year ${termConfig.academic_session}`
    : `${activeTerm}, ${termConfig.academic_session}`;

  let text = `📅 *Attendance Record*\n_Period: ${periodLabel}_\n${DIV}\n\n`;

  for (const student of students) {
    const { present, total, absentRows, subjectAggRows, tier } = queryAttendance(
      db, student.id, termConfig.academic_session,
      scope === "year" ? null : activeTerm
    );

    const pct = total > 0 ? (present / total) * 100 : null;
    const emoji = attendanceEmoji(pct);

    text += `👤 *${student.name}* (${student.class_name})\n`;

    if (total === 0) {
      text += `⚪ _No attendance records found for this period._\n\n`;
      continue;
    }

    text += `${emoji} *${present}/${total} days present* (${pct.toFixed(1)}%)\n`;

    if (absentRows.length > 0) {
      text += `\n📌 *Days Absent (${absentRows.length}):*\n`;

      if (scope === "year") {
        // Group absences by term for full-year view
        const byTerm = absentRows.reduce((acc, row) => {
          (acc[row.term] = acc[row.term] || []).push(row.date);
          return acc;
        }, {});
        for (const [term, dates] of Object.entries(byTerm)) {
          text += `_${term}:_ `;
          text += dates.map(formatDate).join(", ") + "\n";
        }
      } else {
        // Single term — just list dates cleanly in rows of 3
        const formatted = absentRows.map(r => formatDate(r.date));
        // Chunk into rows of 3 for readability
        for (let i = 0; i < formatted.length; i += 3) {
          text += formatted.slice(i, i + 3).join("  ·  ") + "\n";
        }
      }
    } else {
      text += `✅ _No absences recorded!_\n`;
    }

    if (tier === "Diamond" && subjectAggRows && subjectAggRows.length > 0) {
      text += `\n🔬 *Subject-Level Engagement:*\n`;
      let currentTerm = "";
      for (const row of subjectAggRows) {
         if (scope === "year" && row.term !== currentTerm) {
            currentTerm = row.term;
            text += `_${currentTerm}:_\n`;
         }
         const subPct = row.total_classes > 0 ? (row.classes_attended / row.total_classes) * 100 : 0;
         text += `  • ${row.subject_name}: *${subPct.toFixed(0)}%*\n`;
      }
    } else if (tier !== "Diamond") {
      // Upsell info requested in plan (though maybe not strictly explicit queries only)
      // We will only append it if they are not diamond and have no subject rows
      text += `\n_Note: Granular subject-level tracking is available on the Diamond tier. Contact the school office for deeper insights._\n`;
    }

    text += `\n`;
  }

  text += `${DIV}\n_For queries, please contact the school office._\n_Powered by Nexus Pulse_ 🎓`;
  await msg.reply(text);
}

// ─── Fee Status Response ───────────────────────────────────────────────────────
// Reads from the `student_fees` table (populated by the Financial Hub) so the
// balance is always accurate — NOT from the stale `students.fee_status` text
// column, which is never updated when a payment is recorded via the Hub.
async function sendFeeStatus(msg, session, matchable) {
  const db = database.getDb();
  const { students, termConfig, schoolName } = session;

  const fmt = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;

  let text = `💳 *Fee Status*\n_${termConfig.term}, ${termConfig.academic_session}_\n${DIV}\n\n`;

  for (const student of students) {
    text += `👤 *${student.name}* (${student.class_name})\n`;

    const fees = db.prepare(`
      SELECT total_billed, total_paid
      FROM   student_fees
      WHERE  student_id       = ?
        AND  academic_session = ?
        AND  term             = ?
    `).get(student.id, termConfig.academic_session, termConfig.term);

    if (!fees || (!fees.total_billed && !fees.total_paid)) {
      text += `⚪ _No fee record for this term._\n\n`;
      continue;
    }

    const balance = (fees.total_billed || 0) - (fees.total_paid || 0);
    const cleared = balance <= 0;

    text += `${cleared ? '🟢' : '🔴'} *${cleared ? 'Fees Cleared ✅' : 'Outstanding Balance ⚠️'}*\n`;
    text += `   Billed : ${fmt(fees.total_billed)}\n`;
    text += `   Paid   : ${fmt(fees.total_paid)}\n`;

    if (!cleared) {
      text += `   *Balance: ${fmt(balance)}*\n`;
    }

    text += `\n`;
  }

  // Show school bank accounts if configured
  try {
    const settingsRow = db.prepare(`SELECT value FROM app_settings WHERE key = 'fee_settings'`).get();
    const settings = settingsRow ? JSON.parse(settingsRow.value) : {};
    const accounts = settings.bank_accounts || [];
    if (accounts.length) {
      text += `${DIV}\n🏦 *Payment Accounts*\n\n`;
      accounts.forEach(a => {
        text += `*${a.bank}*\n${a.number} — ${a.name}\n\n`;
      });
      // Prompt for receipt upload (Diamond: AI analysis; Gold: manual review)
      text += `${DIV}\n📤 *Submit Proof of Payment*\nReply to this message with a clear *photo or screenshot* of your transfer receipt and our team will verify and update your record.\n\n_Reply 0 to return to the main menu_`;
      // Put the session into AWAITING_RECEIPT state
      session.state = STATE.AWAITING_RECEIPT;
      if (matchable) setSession(matchable, session);
    } else {
      text += `${DIV}\n_For payment enquiries, please contact the school office._\n_Powered by Nexus Pulse_ 🎓`;
    }
  } catch (_) {
    text += `${DIV}\n_For payment enquiries, please contact the school office._\n_Powered by Nexus Pulse_ 🎓`;
  }

  await msg.reply(text);
}

// ─── Main Message Handler (State Machine) ──────────────────────────────────────
async function handleMessage(msg) {
  // Allow media messages even when body is empty (needed for receipt photo uploads)
  if (!msg.from || (!msg.body && !msg.hasMedia)) return;
  if (msg.from.includes("@g.us") || msg.from === "status@broadcast") return;

  const text = (msg.body || '').trim();
  const numericInput = /^[123]$/.test(text) ? parseInt(text, 10) : null;

  // ── Resolve phone ────────────────────────────────────────────────────────────
  const rawPhone = await resolvePhoneNumber(msg);
  const matchable = getMatchableDigits(rawPhone);
  console.log(`[Pulse Bot] From: ${msg.from} | Phone: ${rawPhone} | Key: ${matchable}`);

  if (!matchable) {
    await msg.reply(
      "⚠️ We couldn't identify your phone number.\nPlease contact the school office directly."
    );
    return;
  }

  let session = getSession(matchable);

  // ── Any non-numeric input OR new session → show main menu ───────────────────
  if (!session || !numericInput) {
    const db = database.getDb();
    const students = db
      .prepare("SELECT id, name, class_name FROM students WHERE parent_phone LIKE ?")
      .all(`%${matchable}`);

    if (!students?.length) {
      await msg.reply(
        "⚠️ No students are linked to this phone number.\n" +
        "Please contact the school administrator to update your records."
      );
      return;
    }

    const termConfig = db.prepare("SELECT * FROM school_term_config WHERE id=1").get();
    if (!termConfig) {
      await msg.reply("⚠️ School configuration is incomplete. Please contact the administrator.");
      return;
    }

    // Defensive read — app_settings may not exist on older databases that
    // haven't restarted since the schema migration that added the table.
    let schoolName = "Nexus School";
    try {
      const schoolRow = db.prepare("SELECT value FROM app_settings WHERE key='school_name'").get();
      if (schoolRow?.value) schoolName = schoolRow.value;
    } catch (_) { /* table not yet migrated — use default */ }

    session = createSession(students, termConfig, schoolName);
    setSession(matchable, session);
    await msg.reply(buildMainMenu(schoolName));
    return;
  }

  // ── STATE: MENU — waiting for topic selection (1, 2, 3) ─────────────────────
  if (session.state === STATE.MENU) {
    const choiceMap = { 1: "result", 2: "attendance", 3: "fees" };
    const choice = choiceMap[numericInput];

    if (!choice) {
      await msg.reply("Please reply with *1*, *2*, or *3* to choose an option.");
      return;
    }

    session.menuChoice = choice;

    // Fee status has no period — deliver immediately (keep session for AWAITING_RECEIPT)
    if (choice === "fees") {
      await sendFeeStatus(msg, session, matchable);
      return;
    }

    session.state = STATE.SCOPE;
    setSession(matchable, session);
    await msg.reply(buildScopeMenu(choice, session.termConfig));
    return;
  }

  // ── STATE: SCOPE — waiting for period selection (1, 2, 3) ───────────────────
  if (session.state === STATE.SCOPE) {
    const deliver = async (scope, termOverride = null) => {
      session.scope = scope;
      clearSession(matchable);
      if (session.menuChoice === "result") await sendResults(msg, session, termOverride);
      else await sendAttendance(msg, session, termOverride);
    };

    if (numericInput === 1) {
      await deliver("term");
    } else if (numericInput === 2) {
      await deliver("year");
    } else if (numericInput === 3) {
      session.state = STATE.TERM_SELECT;
      setSession(matchable, session);
      await msg.reply(buildTermMenu());
    }
    return;
  }

  // ── STATE: TERM_SELECT — waiting for specific term ───────────────────────────
  if (session.state === STATE.TERM_SELECT) {
    const termMap = { 1: "First Term", 2: "Second Term", 3: "Third Term" };
    const chosenTerm = termMap[numericInput];

    if (!chosenTerm) {
      await msg.reply("Please reply with *1*, *2*, or *3* to select a term.");
      return;
    }

    session.scope = "specific";
    clearSession(matchable);
    if (session.menuChoice === "result") await sendResults(msg, session, chosenTerm);
    else await sendAttendance(msg, session, chosenTerm);
    return;
  }
  // ── STATE: AWAITING_RECEIPT — parent is expected to send a media file ─────────
  if (session.state === STATE.AWAITING_RECEIPT) {
    // Allow "0" to cancel
    if (text === '0') {
      clearSession(matchable);
      await msg.reply(buildMainMenu(session.schoolName));
      return;
    }
    // Non-media text while waiting — re-prompt
    if (!msg.hasMedia) {
      await msg.reply(`📤 Please send a *photo or screenshot* of your bank transfer receipt, or reply *0* to return to the main menu.`);
      return;
    }

    // Download media
    let media;
    try { media = await msg.downloadMedia(); } catch(e) {
      await msg.reply(`⚠️ Could not receive the image. Please try again or contact the school office.`);
      return;
    }

    clearSession(matchable);

    const db = database.getDb();
    const termConfig = session.termConfig;

    // Get tier
    let tier = 'Gold';
    try {
      const ls = db.prepare(`SELECT value FROM app_settings WHERE key='license_payload'`).get();
      if (ls) tier = JSON.parse(ls.value).tier || 'Gold';
    } catch(_) {}

    // Build base64
    const fileDataB64 = media.data; // already base64 from wwebjs
    const fileType    = media.mimetype || 'image/jpeg';

    // Extract PDF text if applicable
    let pdfRawText = null;
    if (fileType === 'application/pdf') {
      try {
        const { extractPdfText } = require('./receipt-analysis');
        const pr = await extractPdfText(fileDataB64);
        pdfRawText = pr.ok ? pr.text : null;
      } catch(_) {}
    }

    // Diamond: AI analysis
    let aiFields = {};
    if (tier === 'Diamond') {
      try {
        const { analyzeReceiptAI, fuzzyNameMatch } = require('./receipt-analysis');
        const keyRow = db.prepare(`SELECT value FROM app_settings WHERE key='gemini_api_key'`).get();
        const gemKey = keyRow?.value || null;
        if (gemKey) {
          const ai = await analyzeReceiptAI(fileDataB64, fileType, gemKey);
          if (ai.ok) {
            aiFields = {
              extracted_amount:     ai.amount,
              extracted_reference:  ai.reference,
              extracted_date:       ai.date,
              extracted_payer_name: ai.payerName,
              extracted_bank:       ai.bank,
              extracted_confidence: ai.confidence,
              ai_raw_response:      ai.rawResponse,
            };
            // Name match against first student found
            const firstStu = db.prepare(`SELECT parent_name FROM students WHERE id=?`).get(session.students[0]?.id);
            if (firstStu?.parent_name && ai.payerName)
              aiFields.name_match_score = fuzzyNameMatch(firstStu.parent_name, ai.payerName);
          }
        }
      } catch(e) { console.warn('[Pulse] AI receipt analysis failed:', e.message); }
    }

    // Insert receipt for each student linked to this parent
    const ins = db.prepare(`
      INSERT INTO payment_receipts
        (student_id, submitted_via, file_data_b64, file_type,
         extracted_amount, extracted_reference, extracted_date, extracted_payer_name,
         extracted_bank, extracted_confidence, name_match_score,
         pdf_raw_text, ai_raw_response, academic_session, term, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')
    `);

    for (const stu of session.students) {
      try {
        ins.run(
          stu.id, 'whatsapp', fileDataB64, fileType,
          aiFields.extracted_amount     ?? null, aiFields.extracted_reference  ?? null,
          aiFields.extracted_date       ?? null, aiFields.extracted_payer_name ?? null,
          aiFields.extracted_bank       ?? null, aiFields.extracted_confidence ?? null,
          aiFields.name_match_score     ?? null,
          pdfRawText, aiFields.ai_raw_response ?? null,
          termConfig.academic_session, termConfig.term
        );
      } catch(_) {}
    }

    // Notify hub
    try {
      const { mainWindow: mw } = require('electron').app._windows || {};
      // Use global mainWindowRef set at initPulseBot
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        const pending = db.prepare(`SELECT COUNT(*) as c FROM payment_receipts WHERE status='pending'`).get().c;
        mainWindowRef.webContents.send('receipt:new', { count: pending, studentName: session.students[0]?.name || 'A parent' });
      }
    } catch(_) {}

    // Reply based on tier
    const fmt = (n) => `₦${Number(n||0).toLocaleString('en-NG')}`;
    if (tier === 'Diamond' && aiFields.extracted_amount != null) {
      const confPct = Math.round((aiFields.extracted_confidence || 0) * 100);
      let reply = `✅ *Receipt Received*\n${DIV}\n\n`;
      if (aiFields.extracted_amount)     reply += `💰 Amount:    *${fmt(aiFields.extracted_amount)}*\n`;
      if (aiFields.extracted_bank)       reply += `🏦 Bank:      ${aiFields.extracted_bank}\n`;
      if (aiFields.extracted_reference)  reply += `📋 Reference: ${aiFields.extracted_reference}\n`;
      if (aiFields.extracted_date)       reply += `📅 Date:      ${aiFields.extracted_date}\n`;
      if (aiFields.extracted_payer_name) reply += `👤 Payer:     ${aiFields.extracted_payer_name}\n`;
      reply += `\n_Our admin team will verify and update your fees record. You will receive a confirmation message once approved._\n_Powered by Nexus Pulse_ 🎓`;
      await msg.reply(reply);
    } else {
      await msg.reply(`✅ *Receipt Received!*\n\nOur admin team will verify and update your fee record.\n_You will be notified once approved._\n\n_Powered by Nexus Pulse_ 🎓`);
    }
    return;
  }
}

// ─── Module Exports ────────────────────────────────────────────────────────────
module.exports = {
  initPulseBot,
  startPulse,
  destroyPulse,
  getPulseStatus: () => {
    if (!client) return { status: "disconnected" };
    if (isReady) return { status: "ready" };
    if (qrCodeData) return { status: "qr", data: qrCodeData };
    return { status: "starting" };
  },
  sendOTP: async (phone, pin, schoolName) => {
    if (!client || !isReady) throw new Error("WhatsApp bot not ready");
    // Normalize phone to E.164 robustly
    let target = phone.replace(/\D/g, "");
    if (target.length === 10) target = "234" + target;
    else if (target.length === 11 && target.startsWith("0")) target = "234" + target.slice(1);
    if (!target.includes("@c.us")) target += "@c.us";
    
    const message = `🔐 *Nexus Security Challenge*\n\nYour access PIN for *${schoolName}* is: *${pin}*\n\nThis PIN is valid for 12 hours. Do not share this code with anyone.`;
    await client.sendMessage(target, message);
  },
  sendAttendanceAlert: async (phone, studentName, schoolName, date) => {
    if (!client || !isReady) return; // Silent fail for background alerts
    let target = phone.replace(/\D/g, "");
    if (target.length === 10) target = "234" + target;
    else if (target.length === 11 && target.startsWith("0")) target = "234" + target.slice(1);
    if (!target.includes("@c.us")) target += "@c.us";

    const formattedDate = date ? new Date(date).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' }) : 'today';
    const message = `🔔 *Guardian Alert: Attendance*\n\nHello, this is to inform you that *${studentName}* was marked *ABSENT* ${formattedDate} at *${schoolName}*.\n\nIf you believe this is an error, please contact the school office immediately.`;
    
    await client.sendMessage(target, message);
  },
  sendFeeReminder: async (phone, studentName, schoolName, balance) => {
    if (!client || !isReady) return;
    let target = phone.replace(/\D/g, "");
    if (target.length === 10) target = "234" + target;
    else if (target.length === 11 && target.startsWith("0")) target = "234" + target.slice(1);
    if (!target.includes("@c.us")) target += "@c.us";

    const message = `💳 *Nexus Pulse: Fee Reminder*\n\nHello! This is a friendly reminder from *${schoolName}* regarding *${studentName}'s* outstanding balance.\n\n*Current Balance:* ₦${balance.toLocaleString()}\n\nPlease kindly clear this balance at your earliest convenience to avoid any disruption to academic activities.\n\n_Thank you for your partnership._`;
    
    await client.sendMessage(target, message);
  },
  sendMorningBriefing: async (phone, schoolName, stats) => {
    if (!client || !isReady) return;
    let target = phone.replace(/\D/g, "");
    if (target.length === 10) target = "234" + target;
    else if (target.length === 11 && target.startsWith("0")) target = "234" + target.slice(1);
    if (!target.includes("@c.us")) target += "@c.us";

    const date = new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' });
    const message = `📊 *Principal's Morning Briefing*\n_Nexus School OS — ${schoolName}_\n\n🗓️ *Date:* ${date}\n━━━━━━━━━━━━━━━━━━━━\n\n🔹 *Student Enrollment:* ${stats.studentCount}\n🔹 *Present Today:* ${stats.attendance}\n🔹 *Absence Rate:* ${stats.absenceRate}%\n\n✅ *System Status:* Secure & Synchronized\n\n_Generated by Nexus Pulse_ 🎓`;
    
    await client.sendMessage(target, message);
  },

  // ── Generic raw send — used by the Message Queue Worker ─────────────────────
  // Takes a pre-formatted message and a raw phone number. Normalises to E.164.
  sendRawMessage: async (phone, message) => {
    if (!client || !isReady) throw new Error('WhatsApp bot not connected');
    let target = phone.replace(/\D/g, "");
    if (target.length === 10) target = "234" + target;
    else if (target.length === 11 && target.startsWith("0")) target = "234" + target.slice(1);
    if (!target.includes("@c.us")) target += "@c.us";
    await client.sendMessage(target, message);
  }
};

