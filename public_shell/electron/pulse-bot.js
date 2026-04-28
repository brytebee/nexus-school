// ═══════════════════════════════════════════════════════════════════════════════
// Nexus Pulse Bot — Stateful Conversation Engine
// ═══════════════════════════════════════════════════════════════════════════════
"use strict";

const { Client, LocalAuth } = require("whatsapp-web.js");
const { database } = require("../../private_engine");
const path = require("path");
const os = require("os");
const QRCode = require("qrcode");

// ─── Module-level WA client state ─────────────────────────────────────────────
let client = null;
let mainWindowRef = null;
let isReady = false;
let qrCodeData = null;

// ─── Conversation Session Manager ─────────────────────────────────────────────
// Key: last-10-digit phone string  |  Value: Session object
const sessions = new Map();
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes inactivity

const STATE = Object.freeze({
  MENU: "MENU",
  SCOPE: "SCOPE",
  TERM_SELECT: "TERM_SELECT",
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

  try {
    const authPath = path.join(os.homedir(), ".nexus_pulse_auth");
    client = new Client({
      authStrategy: new LocalAuth({ dataPath: authPath }),
      puppeteer: {
        headless: true,
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
      sendStatus("disconnected");
      destroyPulse();
    });

    client.on("message", async (msg) => {
      try {
        await handleMessage(msg);
      } catch (err) {
        console.error("[Pulse Bot] Unhandled error in handleMessage:", err);
      }
    });

    await client.initialize();
  } catch (err) {
    console.error("[Pulse Bot] Failed to initialize:", err);
    sendStatus("error", err.message);
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
  sendStatus("disconnected");
}

// ─── Phone Number Resolution ───────────────────────────────────────────────────
// whatsapp-web.js LIDs (Linked Device IDs) look like long numbers starting with
// 5, 6, or 7 (e.g., 66267268534294). We detect and reject these in favour of
// the actual E.164 phone number via multiple fallback strategies.

async function resolvePhoneNumber(msg) {
  try {
    const contact = await msg.getContact();
    console.log(`[Pulse Bot] Raw JID: ${msg.from} | contact.number: ${contact.number}`);

    // Strategy 1: Contact's own number field (most reliable)
    if (contact.number && isLikelyPhone(contact.number)) {
      console.log("[Pulse Bot] Phone resolved via contact.number");
      return contact.number;
    }

    // Strategy 2: contact.id._serialized stripped of @c.us and device suffix
    const serialized = contact.id?._serialized ?? "";
    if (serialized.includes("@c.us")) {
      const extracted = serialized.split("@")[0].split(":")[0];
      if (isLikelyPhone(extracted)) {
        console.log("[Pulse Bot] Phone resolved via contact.id._serialized");
        return extracted;
      }
    }

    // Strategy 3: client.getNumberId lookup (resolves LID → real number)
    if (client) {
      const lid = msg.from.split("@")[0].split(":")[0];
      try {
        const wid = await client.getNumberId(lid);
        if (wid) {
          const resolved = wid._serialized.split("@")[0];
          if (isLikelyPhone(resolved)) {
            console.log("[Pulse Bot] Phone resolved via getNumberId");
            return resolved;
          }
        }
      } catch (lidErr) {
        console.warn("[Pulse Bot] getNumberId failed:", lidErr.message);
      }
    }

    // Strategy 4: Parse directly from msg.from JID
    if (msg.from.includes("@c.us")) {
      const fromPhone = msg.from.split("@")[0].split(":")[0];
      if (isLikelyPhone(fromPhone)) {
        console.log("[Pulse Bot] Phone resolved via msg.from JID");
        return fromPhone;
      }
    }

    console.warn("[Pulse Bot] All resolution strategies exhausted.", {
      from: msg.from, number: contact.number, serialized,
    });
    return null;
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

  return { present, total, absentRows };
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
    const { present, total, absentRows } = queryAttendance(
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

    // Missed dates breakdown
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

    text += `\n`;
  }

  text += `${DIV}\n_For queries, please contact the school office._\n_Powered by Nexus Pulse_ 🎓`;
  await msg.reply(text);
}

async function sendFeeStatus(msg, session) {
  const db = database.getDb();
  const { students, termConfig } = session;

  let text = `💳 *Fee Status*\n_Term: ${termConfig.term}, ${termConfig.academic_session}_\n${DIV}\n\n`;

  for (const student of students) {
    const row = db.prepare("SELECT fee_status FROM students WHERE id=?").get(student.id);
    const status = row?.fee_status ?? "unknown";
    const cleared = status === "cleared";
    const emoji = cleared ? "🟢" : status === "debtor" ? "🔴" : "⚪";
    const label = cleared ? "Fees Cleared ✅" : status === "debtor" ? "Outstanding Balance ⚠️" : "Status Unknown";
    text += `👤 *${student.name}* (${student.class_name})\n${emoji} ${label}\n\n`;
  }

  text += `${DIV}\n_For payment enquiries, please contact the school office._\n_Powered by Nexus Pulse_ 🎓`;
  await msg.reply(text);
}

// ─── Main Message Handler (State Machine) ──────────────────────────────────────
async function handleMessage(msg) {
  if (!msg.from || !msg.body) return;
  if (msg.from.includes("@g.us") || msg.from === "status@broadcast") return;

  const text = msg.body.trim();
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

    // Fee status has no period — deliver immediately
    if (choice === "fees") {
      clearSession(matchable);
      await sendFeeStatus(msg, session);
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
};
