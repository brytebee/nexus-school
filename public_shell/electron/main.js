console.log("\n\n*******************************************");
console.log("*       NEXUS DEMO HUB - VERSION 2.3      *");
console.log("*******************************************\n");

const { app, BrowserWindow, ipcMain, shell, Menu, dialog, nativeImage, clipboard, globalShortcut } = require("electron");

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const dgram = require("dgram");
const Handlebars = require("handlebars");
const { database, server, reports } = require("../../private_engine");
const scholar = require("../../private_engine/src/scholar");
const { startServer, setSchoolConfig, setSchoolLicense, revokeDevice, handleCSVUpload, clearData } = server;
const address = require("address");
const pulseBot     = require('./pulse-bot.js');
const pulseExporter = require('./pulse-exporter.js');
const receiptAnalysis = require('./receipt-analysis.js');
const express = require('express');
const { Bonjour } = require('bonjour-service');
const bonjour = new Bonjour();

// Set app name BEFORE createWindow so Menu.buildFromTemplate picks it up correctly
app.setName("NexusSchoolOS");

// ── Single-instance lock: prevents duplicate processes fighting over ports ──
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  // Another instance is already running — bring it to front and quit this one
  console.warn('[Nexus] Duplicate instance detected. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to launch a second instance — focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

if (!app) {
  console.error(
    "[CRITICAL] Electron 'app' is undefined. Ensure you are running with 'electron .'",
  );
}


let mainWindow;

// ── State at module scope so IPC handlers can safely access it ──
let identityPacket = {
  name: "Green Valley High",
  themePrimary: "#1A237E",
  themeSecondary: "#00E5FF",
  logoBase64: null,
  address: "",
  motto: "",
  signature: "",           // Principal's name (text — used by calligraphy-style templates)
  principalSignBase64: null, // Principal's image signature (uploaded via Settings)
  stamp: "",
  stampStyle: "none",
  stampCustomColor: null
};
let identityFilePath = "";
let qrPayload = null;
let licenseStatus = { locked: false, message: "" };

// Synchronous getter — renderer calls this at boot to pre-populate tier
// before the reactive `license-status` push event arrives.
ipcMain.handle('license:get-status', () => licenseStatus);

// ── ALL ipcMain.handle registrations (ONCE at module scope) ──────────────────

ipcMain.on("pulse:start", () => {
    if (licenseStatus?.tier === 'Gold' || licenseStatus?.tier === 'Diamond') {
        pulseBot.startPulse();
    } else {
        console.warn("[Pulse] Attempted start on non-eligible tier:", licenseStatus?.tier);
    }
});
ipcMain.on("pulse:stop", () => pulseBot.destroyPulse());
ipcMain.handle("pulse:status", () => pulseBot.getPulseStatus());

// ── CBT ENGINE IPC ───────────────────────────────────────────────────────────
require('./cbt-ipc-handlers')(database);

// ── ATTENDANCE ENGINE IPC (V2.3) ─────────────────────────────────────────────
// Pass a lightweight enqueue helper so the Guardian Shield can WhatsApp parents
require('./attendance-ipc-handlers')(database, (phone, message, studentId) => {
    try {
        database.getDb().prepare(
            "INSERT INTO pending_pulse_messages (phone, message, type, student_id) VALUES (?, ?, 'guardian_alert', ?)"
        ).run(phone, message, studentId);
    } catch(e) { console.error('[Guardian Shield] Enqueue failed:', e.message); }
});

// ── NEXUS SCHOLAR IPC ────────────────────────────────────────────────────────
ipcMain.handle("scholar:get-stats", () => scholar.getStats());
ipcMain.handle("scholar:query", async (event, query) => {
    try {
        const db = database.getDb();
        const row = db.prepare("SELECT value FROM app_settings WHERE key = 'gemini_api_key'").get();
        const apiKey = row ? row.value : null;
        const res = await scholar.query(query, apiKey);
        return { ok: true, ...res };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});
ipcMain.handle("scholar:clear", () => {
    scholar.clearIndex();
    return { ok: true };
});
ipcMain.handle("scholar:upload", async (event, { fileData, fileName }) => {
    return await scholar.ingestDocument(fileData, fileName);
});

// ── GENERIC APP SETTINGS KV STORE ────────────────────────────────────────────
ipcMain.handle("app-settings:get", (event, key) => {
    const row = database.getDb().prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
    return row ? row.value : null;
});
ipcMain.handle("app-settings:set", (event, { key, value }) => {
    database.getDb().prepare(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)"
    ).run(key, value);
    return { ok: true };
});


// ─────────────────────────────────────────────────────────────────────────────
// ADMIN AUTHENTICATION — The Vault (Phase 9)
// ─────────────────────────────────────────────────────────────────────────────

// Current session (who is logged in). Persists for the lifetime of the app process.
let currentAdminSession = null;

ipcMain.handle('auth:get-admins', () => {
    const db = database.getDb();
    // Use role_level instead of role string, username instead of name.
    return db.prepare('SELECT id, username, role_level, avatar FROM admin_users ORDER BY role_level DESC, username ASC').all();
});

ipcMain.handle('auth:verify-pin', (event, { adminId, pin }) => {
    const db = database.getDb();
    const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(adminId);
    if (!admin) return { ok: false, error: 'Admin not found' };
    
    // For simplicity in the Vault, the hash is base64 of the pin.
    const pinHash = Buffer.from(String(pin)).toString('base64');
    if (pinHash !== admin.secret_hash) return { ok: false, error: 'Incorrect PIN' };
    
    currentAdminSession = { id: admin.id, username: admin.username, role_level: admin.role_level, loginAt: Date.now() };
    console.log(`[Auth] Session opened: ${admin.username} (Level ${admin.role_level})`);
    
    // Log the login event
    db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'LOGIN', 'SYSTEM', 'Session initialized')").run(admin.id);
    
    return { ok: true, username: admin.username, role_level: admin.role_level };
});

ipcMain.handle('auth:logout', () => {
    if (currentAdminSession) {
        const db = database.getDb();
        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'LOGOUT', 'SYSTEM', 'Session terminated')").run(currentAdminSession.id);
    }
    currentAdminSession = null;
    console.log(`[Auth] Session closed.`);
    return { ok: true };
});

const pendingOTPs = {};

ipcMain.handle('auth:forgot-password', (event, { adminId }) => {
    const db = database.getDb();
    const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(adminId);
    if (!admin) return { ok: false, error: 'Admin not found' };

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    pendingOTPs[adminId] = { otp, expiresAt: Date.now() + 10 * 60000 }; // 10 min expiry

    // Phone is stored in identityPacket.principalPhone (loaded from identity.json at boot)
    // NOT in app_settings — so we read it directly from the in-memory packet.
    const phone = identityPacket?.principalPhone?.trim() || null;

    if (!phone && process.env.DEV_MODE !== 'true') {
        return { ok: false, error: 'School contact phone not configured. Go to Settings → School Identity and save the Principal phone first.' };
    }

    const message = `*Nexus School OS - Emergency Access*\n\nAdmin: ${admin.username}\nYour OTP is: *${otp}*\n\nThis OTP expires in 10 minutes.`;

    // Only queue WhatsApp message if we have a real phone number
    // (in DEV_MODE with no phone configured, we skip the queue to avoid NOT NULL crash)
    if (phone) {
        try {
            db.prepare(`
                INSERT INTO pending_pulse_messages (phone, message, type, status)
                VALUES (?, ?, 'otp', 'pending')
            `).run(phone, message);
        } catch (e) {
            console.warn('[OTP] Could not queue WhatsApp message:', e.message);
        }
    }

    db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'OTP_REQUESTED', 'SYSTEM', 'Emergency OTP requested via Pulse')").run(adminId);

    const result = { ok: true };
    if (process.env.DEV_MODE === 'true') result.devOtp = otp;
    return result;
});


ipcMain.handle('auth:verify-otp-login', (event, { adminId, otp }) => {
    const db = database.getDb();
    const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(adminId);
    if (!admin) return { ok: false, error: 'Admin not found' };

    const record = pendingOTPs[adminId];
    if (!record) return { ok: false, error: 'No OTP requested' };
    if (Date.now() > record.expiresAt) {
        delete pendingOTPs[adminId];
        return { ok: false, error: 'OTP expired' };
    }
    if (record.otp !== otp) return { ok: false, error: 'Invalid OTP' };

    // Login successful
    delete pendingOTPs[adminId];
    currentAdminSession = { id: admin.id, username: admin.username, role_level: admin.role_level, loginAt: Date.now() };
    console.log(`[Auth] Session opened via OTP: ${admin.username} (Level ${admin.role_level})`);
    
    db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'LOGIN', 'SYSTEM', 'Session initialized via Emergency OTP')").run(admin.id);
    
    return { ok: true, username: admin.username, role_level: admin.role_level };
});

// auth:change-pin — called after OTP verify to let admin set a new PIN/password
ipcMain.handle('auth:change-pin', (event, { adminId, newPin, authType }) => {
    try {
        const db = database.getDb();
        const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(adminId);
        if (!admin) return { ok: false, error: 'Admin not found' };
        if (!newPin || newPin.trim().length < 4) return { ok: false, error: 'PIN must be at least 4 characters.' };
        const newHash = Buffer.from(newPin.trim()).toString('base64');
        db.prepare('UPDATE admin_users SET secret_hash = ?, auth_type = ? WHERE id = ?')
          .run(newHash, authType || admin.auth_type || 'pin', adminId);
        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'PIN_CHANGED', 'SYSTEM', 'Admin changed credentials via Emergency OTP flow')").run(adminId);
        console.log(`[Auth] PIN changed for admin ID ${adminId}`);
        return { ok: true };
    } catch (e) {
        console.error('[Auth] change-pin error:', e);
        return { ok: false, error: e.message };
    }
});

// auth:create-admin — Super-admins can add new staff accounts
ipcMain.handle('auth:create-admin', (event, { username, pin, roleLevel, displayName }) => {
    try {
        const db = database.getDb();
        if (!username?.trim() || !pin?.trim()) return { ok: false, error: 'Username and PIN are required.' };
        const exists = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username.trim());
        if (exists) return { ok: false, error: `Username "${username.trim()}" is already taken.` };
        if (pin.trim().length < 4) return { ok: false, error: 'PIN must be at least 4 characters.' };
        const hash = Buffer.from(pin.trim()).toString('base64');
        const result = db.prepare(`INSERT INTO admin_users (username, secret_hash, auth_type, role_level) VALUES (?, ?, 'pin', ?)`).run(username.trim(), hash, parseInt(roleLevel) || 1);
        if (currentAdminSession) db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'CREATE_ADMIN', 'admin_users', ?)").run(currentAdminSession.id, `Created: ${username.trim()} (Level ${roleLevel || 1})`);
        return { ok: true, id: result.lastInsertRowid };
    } catch (e) { return { ok: false, error: e.message }; }
});

// auth:delete-admin — Remove a staff account (cannot delete self or last super-admin)
ipcMain.handle('auth:delete-admin', (event, { adminId }) => {
    try {
        const db = database.getDb();
        const target = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(adminId);
        if (!target) return { ok: false, error: 'Admin not found.' };
        if (currentAdminSession?.id === adminId) return { ok: false, error: 'You cannot delete your own account.' };
        const superCount = db.prepare('SELECT COUNT(*) as c FROM admin_users WHERE role_level = 9').get().c;
        if (target.role_level === 9 && superCount <= 1) return { ok: false, error: 'Cannot delete the only Super Admin account.' };
        db.prepare('DELETE FROM admin_users WHERE id = ?').run(adminId);
        if (currentAdminSession) db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'DELETE_ADMIN', 'admin_users', ?)").run(currentAdminSession.id, `Deleted: ${target.username}`);
        return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
});

// cbt:scholar-extract — reads Gemini key from DB; uses AI if available, regex fallback otherwise
ipcMain.handle('cbt:scholar-extract', async (event, { fileData, fileName }) => {
    const db = database.getDb();
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'gemini_api_key'").get();
    const apiKey = row?.value || null;
    return await scholar.extractQuestions(fileData, fileName, 15, apiKey);
});

ipcMain.handle('auth:get-session', () => currentAdminSession);

ipcMain.handle('auth:get-audit-logs', () => {
    const db = database.getDb();
    return db.prepare(`
        SELECT a.id, a.action, a.target, a.details, a.timestamp, u.username as admin_name 
        FROM audit_logs a 
        LEFT JOIN admin_users u ON a.admin_id = u.id 
        ORDER BY a.timestamp DESC 
        LIMIT 100
    `).all();
});

// auth:unlock — fired by lock.html after PIN accepted. Loads the main app.
ipcMain.on('auth:unlock', () => {
    if (!mainWindow) return;
    const targetFile = process.env.USE_REACT_UI === 'true' ? 'renderer.html' : 'index.html';
    mainWindow.loadFile(targetFile);
    console.log(`[Auth] Lock screen dismissed. Loading ${targetFile}.`);
});

ipcMain.on('auth:lock', () => {
    if (!mainWindow) return;
    if (currentAdminSession) {
        const db = database.getDb();
        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'LOCK', 'SYSTEM', 'Idle timeout triggered lock')").run(currentAdminSession.id);
        currentAdminSession = null;
    }
    mainWindow.loadFile('lock.html');
    console.log(`[Auth] System locked due to idle timeout.`);
});


// ─────────────────────────────────────────────────────────────────────────────
// FEE STRUCTURE (Class-Level Billing + Adjustments) — Gold Phase B
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('fee-structure:get-all', (event, { className } = {}) => {
    const db = database.getDb();
    if (className) {
        return db.prepare('SELECT * FROM fee_structures WHERE class_name = ? ORDER BY item_name ASC').all(className);
    }
    return db.prepare('SELECT * FROM fee_structures ORDER BY class_name ASC, item_name ASC').all();
});

ipcMain.handle('fee-structure:upsert-item', (event, { id, className, itemName, amount, term }) => {
    const db = database.getDb();
    const adminId = currentAdminSession ? currentAdminSession.id : null;
    
    if (id) {
        db.prepare('UPDATE fee_structures SET class_name=?, item_name=?, amount=?, term=? WHERE id=?')
          .run(className, itemName, amount, term || 'All Terms', id);
        
        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'UPDATE_FEE_ITEM', 'fee_structures', ?)").run(adminId, `Updated ${itemName} for ${className} (₦${amount})`);
        return { ok: true, id };
    }
    const result = db.prepare('INSERT OR REPLACE INTO fee_structures (class_name, item_name, amount, term) VALUES (?,?,?,?)')
      .run(className, itemName, amount, term || 'All Terms');
      
    db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'ADD_FEE_ITEM', 'fee_structures', ?)").run(adminId, `Added ${itemName} for ${className} (₦${amount})`);
    return { ok: true, id: result.lastInsertRowid };
});

ipcMain.handle('fee-structure:delete-item', (event, id) => {
    const db = database.getDb();
    const item = db.prepare('SELECT * FROM fee_structures WHERE id = ?').get(id);
    db.prepare('DELETE FROM fee_structures WHERE id = ?').run(id);
    
    if (item) {
        const adminId = currentAdminSession ? currentAdminSession.id : null;
        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'DELETE_FEE_ITEM', 'fee_structures', ?)").run(adminId, `Deleted ${item.item_name} for ${item.class_name}`);
    }
    return { ok: true };
});

// Bulk-apply the fee structure total to all students in a class
ipcMain.handle('fee-structure:apply-to-class', (event, { className, academicSession, term }) => {
    const db = database.getDb();
    const termConfig = db.prepare('SELECT * FROM school_term_config WHERE id = 1').get();
    const session = academicSession || termConfig.academic_session;
    const activeTerm = term || termConfig.term;

    const { total } = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM fee_structures
        WHERE class_name = ? AND (term = 'All Terms' OR term = ?)
    `).get(className, activeTerm);

    const students = db.prepare('SELECT id FROM students WHERE class_name = ?').all(className);
    if (students.length === 0) return { ok: false, error: 'No students in class', count: 0 };

    const upsert = db.prepare(`
        INSERT INTO student_fees (student_id, academic_session, term, total_billed, total_paid, status)
        VALUES (?, ?, ?, ?, 0, 'unpaid')
        ON CONFLICT(student_id, academic_session, term) DO UPDATE SET
          total_billed = excluded.total_billed, updated_at = datetime('now')
    `);
    db.transaction(() => { for (const s of students) upsert.run(s.id, session, activeTerm, total); })();

    const adminId = currentAdminSession ? currentAdminSession.id : null;
    db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'BULK_APPLY_FEES', 'student_fees', ?)").run(adminId, `Applied ₦${total.toLocaleString()} to ${students.length} students in ${className}`);

    console.log(`[Fee Structure] Applied ₦${total.toLocaleString()} to ${students.length} students in ${className}`);
    return { ok: true, count: students.length, totalBilled: total };
});

ipcMain.handle('fee-structure:get-adjustments', (event, { studentId, academicSession, term } = {}) => {
    const db = database.getDb();
    const termConfig = db.prepare('SELECT * FROM school_term_config WHERE id = 1').get();
    const session = academicSession || termConfig.academic_session;
    const activeTerm = term || termConfig.term;
    if (studentId) {
        return db.prepare(`
            SELECT fa.*, s.name as student_name, s.class_name FROM fee_adjustments fa
            JOIN students s ON fa.student_id = s.id
            WHERE fa.student_id = ? AND fa.academic_session = ? AND fa.term = ?
            ORDER BY fa.created_at DESC
        `).all(studentId, session, activeTerm);
    }
    return db.prepare(`
        SELECT fa.*, s.name as student_name, s.class_name FROM fee_adjustments fa
        JOIN students s ON fa.student_id = s.id
        WHERE fa.academic_session = ? AND fa.term = ?
        ORDER BY s.class_name, s.name
    `).all(session, activeTerm);
});

ipcMain.handle('fee-structure:add-adjustment', (event, data) => {
    const db = database.getDb();
    const { studentId, adjustmentType, description, amount } = data;
    const termConfig = db.prepare('SELECT * FROM school_term_config WHERE id = 1').get();
    const session = data.academicSession || termConfig.academic_session;
    const term = data.term || termConfig.term;
    const adminName = data.approvedBy || currentAdminSession?.name || 'Admin';

    db.transaction(() => {
        db.prepare(`
            INSERT INTO fee_adjustments (student_id, academic_session, term, adjustment_type, description, amount, approved_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(studentId, session, term, adjustmentType || 'discount', description || '', amount, adminName);
        // Reduce total_billed by adjustment amount
        db.prepare(`
            UPDATE student_fees SET total_billed = MAX(0, total_billed - ?), updated_at = datetime('now')
            WHERE student_id = ? AND academic_session = ? AND term = ?
        `).run(amount, studentId, session, term);
    })();
    const adminId = currentAdminSession ? currentAdminSession.id : null;
    db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'ADD_FEE_ADJUSTMENT', 'fee_adjustments', ?)").run(adminId, `Added ${adjustmentType} of ₦${amount} for student ${studentId}`);
    return { ok: true };
});

ipcMain.handle('fee-structure:delete-adjustment', (event, id) => {
    const db = database.getDb();
    const adj = db.prepare('SELECT * FROM fee_adjustments WHERE id = ?').get(id);
    db.prepare('DELETE FROM fee_adjustments WHERE id = ?').run(id);
    if (adj) {
        const adminId = currentAdminSession ? currentAdminSession.id : null;
        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'DELETE_FEE_ADJUSTMENT', 'fee_adjustments', ?)").run(adminId, `Deleted adjustment ID ${id} for student ${adj.student_id}`);
    }
    return { ok: true };
});

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP MESSAGE QUEUE WORKER — Gold Phase B
// Drains pending_pulse_messages one message at a time every 3 seconds.
// Prevents UI freeze and WhatsApp rate-limit bans during bulk sends.
// ─────────────────────────────────────────────────────────────────────────────

function startMessageQueueWorker() {
    const QUEUE_INTERVAL_MS = 3000;
    const MAX_ATTEMPTS = 3;

    setInterval(async () => {
        const status = pulseBot.getPulseStatus();
        if (!status || status.status !== 'ready') return;

        const db = database.getDb();
        const msg = db.prepare(`
            SELECT * FROM pending_pulse_messages
            WHERE status = 'pending' AND attempts < ?
            ORDER BY created_at ASC LIMIT 1
        `).get(MAX_ATTEMPTS);
        if (!msg) return;

        db.prepare("UPDATE pending_pulse_messages SET status='sending', attempts=attempts+1 WHERE id=?").run(msg.id);

        try {
            await pulseBot.sendRawMessage(msg.phone, msg.message);
            db.prepare("UPDATE pending_pulse_messages SET status='sent', sent_at=datetime('now') WHERE id=?").run(msg.id);
        } catch (err) {
            const newStatus = msg.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending';
            db.prepare("UPDATE pending_pulse_messages SET status=?, error_msg=? WHERE id=?").run(newStatus, err.message, msg.id);
        }

        if (mainWindow) {
            const stats = db.prepare(`
                SELECT
                  SUM(CASE WHEN status IN ('pending','sending') THEN 1 ELSE 0 END) as pending,
                  SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) as sent,
                  SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed
                FROM pending_pulse_messages
            `).get();
            mainWindow.webContents.send('queue:progress', stats);
        }
    }, QUEUE_INTERVAL_MS);
    console.log('[Queue] WhatsApp message queue worker started.');
}

ipcMain.handle("pulse:trigger-digest", async (event, { class_name }) => {
  try {
    const db = database.getDb();
    const students = db.prepare("SELECT id, name, parent_phone FROM students WHERE class_name = ?").all(class_name);
    
    let count = 0;
    const enqueueMsg = db.prepare(`
      INSERT INTO pending_pulse_messages (phone, message, type, student_id)
      VALUES (?, ?, 'digest', ?)
    `);

    db.transaction(() => {
      for (const s of students) {
        if (s.parent_phone) {
          const msg = `📚 Nexus Weekly Digest:\n\nDear Parent, here is the weekly summary for ${s.name}.\n- Attendance: 100%\n- Assignments: 3 completed.\nHave a great weekend!`;
          enqueueMsg.run(s.parent_phone, msg, s.id);
          count++;
        }
      }
    })();
    return { ok: true, queued: count };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('queue:get-status', () => {
    return database.getDb().prepare(`
        SELECT
          SUM(CASE WHEN status IN ('pending','sending') THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
          COUNT(*) as total
        FROM pending_pulse_messages
    `).get();
});

// Overwrite the old trigger-fee-reminders to use the queue instead of direct sends
ipcMain.removeAllListeners('trigger-fee-reminders');
ipcMain.on('trigger-fee-reminders', () => {
    const db = database.getDb();
    const termConfig = db.prepare('SELECT * FROM school_term_config WHERE id = 1').get();
    const debtors = db.prepare(`
        SELECT s.name, s.parent_phone, f.total_billed, f.total_paid
        FROM students s JOIN student_fees f ON s.id = f.student_id
        WHERE f.academic_session = ? AND f.term = ?
          AND (f.total_billed - f.total_paid) > 0
          AND s.parent_phone IS NOT NULL AND s.parent_phone != ''
    `).all(termConfig.academic_session, termConfig.term);

    const schoolName = identityPacket.name || 'Nexus School';
    const enqueue = db.prepare(`INSERT INTO pending_pulse_messages (phone, message, type) VALUES (?, ?, 'fee_reminder')`);
    db.transaction(() => {
        for (const d of debtors) {
            const balance = (d.total_billed - d.total_paid).toLocaleString('en-NG');
            const msg = `Hello! This is a reminder from ${schoolName}.\n\nStudent: *${d.name}*\nOutstanding Balance: *₦${balance}*\n\nKindly make payment to avoid any inconvenience. Thank you! 📚`;
            enqueue.run(d.parent_phone, msg);
        }
    })();
    console.log(`[Queue] ${debtors.length} fee reminders enqueued.`);
    if (mainWindow) mainWindow.webContents.send('fee-reminders-queued', { count: debtors.length });
});

// ── Pulse Cloud Bridge (Turn 2) ───────────────────────────────────────────

ipcMain.on("pulse:save-google-creds", async (event, { clientId, clientSecret }) => {
    const db = database.getDb();
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('google_client_id', ?)").run(clientId);
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('google_client_secret', ?)").run(clientSecret);
    // Await init so oAuth2Client is ready before the auth URL is requested.
    await pulseExporter.init();
    console.log('[Pulse] Google credentials saved and OAuth client re-initialised.');
});

ipcMain.handle("pulse:get-google-auth-url", async () => {
    await pulseExporter.init();
    if (!pulseExporter.oAuth2Client) return null;
    return pulseExporter.oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/drive.file'],
        prompt: 'consent'
    });
});

ipcMain.handle("pulse:get-cloud-status", () => {
    return {
        isConfigured: !!pulseExporter.oAuth2Client,
        isSyncing: pulseExporter.isSyncing,
        securityKey: pulseExporter.getOrCreateSecurityKey(),
        refreshToken: pulseExporter.getRefreshToken()
    };
});

ipcMain.on("pulse:trigger-sync", () => pulseExporter.syncToDrive());

ipcMain.handle("get-identity", () => {
  return { ...identityPacket, tier: licenseStatus?.tier || "Silver" };
});

// ── Portal Info (Nexus Mask Architecture) ────────────────────────────────────
// Returns the real LAN IP URL (for QR), the branded .edu.nexus URL (display-only),
// and ALL non-loopback IPv4 addresses so the admin can troubleshoot multi-NIC/hotspot setups.
ipcMain.handle("portal:get-info", () => {
  const PORTAL_PORT = 3002;
  const nets = os.networkInterfaces();

  // Collect every non-loopback IPv4 address — first one becomes primary.
  const allIps = [];
  for (const iface of Object.values(nets)) {
    for (const n of iface) {
      if (n.family === "IPv4" && !n.internal) allIps.push(n.address);
    }
  }
  const lanIp = allIps[0] || "127.0.0.1";

  const schoolName = identityPacket?.name || "Nexus";
  // portalSlug: school-customisable; falls back to sanitised first word of school name
  const namePart = (identityPacket?.portalSlug || schoolName.split(" ")[0])
    .toLowerCase().replace(/[^a-z0-9]/g, "");
  return {
    schoolName,
    namePart,
    lanIp,
    allIps,          // ← full list for diagnostic display
    port:     PORTAL_PORT,
    realUrl:  `http://${lanIp}:${PORTAL_PORT}/portal`,
    mdnsUrl:  `http://${namePart}.nexus.local`,
    brandUrl: `http://${namePart}.edu.nexus`,
  };
});

ipcMain.handle("get-unique-metadata", () => {
  try {
    const db = database.getDb();
    const classes = db.prepare("SELECT DISTINCT class_name FROM students WHERE class_name IS NOT NULL AND class_name != '' ORDER BY class_name ASC").all().map(r => r.class_name);
    
    const subjects = db.prepare(`
      SELECT DISTINCT subject FROM student_subjects 
      UNION 
      SELECT DISTINCT subject FROM teacher_allocations
      WHERE subject IS NOT NULL AND subject != ''
      ORDER BY subject ASC
    `).all().map(r => r.subject);
    
    return { classes, subjects };
  } catch (err) {
    console.error("Failed to fetch unique metadata:", err);
    return { classes: [], subjects: [] };
  }
});

ipcMain.handle("get-classes", () => {
  try {
    const db = database.getDb();
    const rows = db.prepare("SELECT DISTINCT class_name FROM students WHERE class_name IS NOT NULL AND class_name != '' ORDER BY class_name ASC").all();
    return rows.map(r => r.class_name);
  } catch (err) {
    console.error("Failed to fetch classes:", err);
    return [];
  }
});

ipcMain.handle("get-teachers", () => {
  try {
    const db = database.getDb();
    const teachers = db
      .prepare(`
        SELECT t.id, t.name, t.phone, t.email, t.signature, f.class_name as host_class
        FROM teachers t
        LEFT JOIN form_teachers f ON t.id = f.teacher_id
        ORDER BY t.name ASC
      `)
      .all();
    
    // Enrich with subject allocations
    for (const t of teachers) {
      t.allocations = db.prepare("SELECT class_name, subject FROM teacher_allocations WHERE teacher_id = ?").all(t.id);
    }
    
    return teachers;
  } catch (err) {
    console.error("Failed to fetch teachers:", err);
    return [];
  }
});

// ── Teacher Identity QR Authority (single source of truth) ───────────────────
ipcMain.handle("set-teacher", (event, { id, name }) => {
  if (!qrPayload) return false;
  qrPayload.teacher_id = id;
  qrPayload.teacher_name = name;
  if (mainWindow) {
    mainWindow.webContents.send("qr-payload", qrPayload);
    console.log(`[Electron] QR updated for teacher: ${name} [${id}]`);
  }
  return true;
});

// ── DB Stats (for wizard gate logic) ─────────────────────────────────────────
ipcMain.handle("get-db-stats", () => {
  try {
    const db = database.getDb();
    const teachers = db.prepare("SELECT COUNT(*) as c FROM teachers").get().c;
    const students = db.prepare("SELECT COUNT(*) as c FROM students").get().c;
    return { teachers, students };
  } catch (err) {
    return { teachers: 0, students: 0 };
  }
});

// ── Form-based Teacher Entry ──────────────────────────────────────────────────
// allocations: [{ class_name: 'JSS1', subjects: ['Mathematics', 'English'] }, ...]
ipcMain.handle(
  "add-teacher-form",
  (event, { id, name, phone, email, signature, allocations }) => {
    try {
      const db = database.getDb();
      db.prepare(
        `INSERT INTO teachers (id, name, phone, email, signature)
         VALUES (@id, @name, @phone, @email, @signature)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, phone=excluded.phone,
           email=excluded.email, signature=excluded.signature`,
      ).run({ id, name, phone: phone || "", email: email || "", signature: signature || null });

      if (allocations && allocations.length > 0) {
        const insertAlloc = db.prepare(
          "INSERT OR IGNORE INTO teacher_allocations (teacher_id, class_name, subject) VALUES (?, ?, ?)",
        );
        const insertAll = db.transaction(() => {
          for (const alloc of allocations) {
            const { class_name, subjects = [] } = alloc;
            if (!class_name) continue;
            for (const subject of subjects) {
              if (subject.trim())
                insertAlloc.run(id, class_name, subject.trim());
            }
          }
        });
        insertAll();
      }
      console.log(
        `[Form] Teacher added: ${name} with ${(allocations || []).length} class allocations.`,
      );
      return { ok: true, id };
    } catch (err) {
      console.error("[Form] Failed to add teacher:", err);
      return { ok: false, error: err.message };
    }
  },
);

// ── Form-based Teacher Update — profile only (legacy stub) ────────────────────────────
ipcMain.handle("update-teacher", (event, { id, name, phone, email }) => {
  try {
    const db = database.getDb();
    db.prepare(
      "UPDATE teachers SET name=@name, phone=@phone, email=@email WHERE id=@id",
    ).run({ id, name, phone: phone || "", email: email || "" });
    console.log(`[Form] Teacher profile updated: ${name}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Full Teacher Update — profile + replace all allocations ────────────────────────────
ipcMain.handle("update-teacher-full", (event, { id, name, phone, email, signature, allocations, host_class }) => {
  try {
    const db = database.getDb();
    db.transaction(() => {
      db.prepare(
        "UPDATE teachers SET name=@name, phone=@phone, email=@email, signature=@signature WHERE id=@id",
      ).run({ id, name: name || "", phone: phone || "", email: email || "", signature: signature || null });
      db.prepare("DELETE FROM teacher_allocations WHERE teacher_id = ?").run(id);
      if (allocations && allocations.length > 0) {
        const ins = db.prepare(
          "INSERT OR IGNORE INTO teacher_allocations (teacher_id, class_name, subject) VALUES (?, ?, ?)",
        );
        for (const alloc of allocations) {
          const { class_name, subjects = [] } = alloc;
          if (!class_name) continue;
          for (const subj of subjects) {
            if (subj.trim()) ins.run(id, class_name, subj.trim());
          }
        }
      }
      // Sync Form Teacher role
      db.prepare("DELETE FROM form_teachers WHERE teacher_id = ?").run(id);
      if (host_class) {
        db.prepare(`
          INSERT INTO form_teachers (class_name, teacher_id) 
          VALUES (?, ?)
          ON CONFLICT(class_name) DO UPDATE SET teacher_id = excluded.teacher_id
        `).run(host_class, id);
      }
    })();
    console.log(`[Form] Teacher ${id} fully updated (Host: ${host_class || 'None'}).`);
    return { ok: true };
  } catch (err) {
    console.error('[Form] update-teacher-full failed:', err);
    return { ok: false, error: err.message };
  }
});

// ── Form-based Student Entry (mobile adds/edits; this is a DB stub) ───────────
ipcMain.handle("add-student-form", (event, { id, name, class_name, subjects, reg_no, gender, dob, photo, parent_email, parent_phone, parent_name, fee_status }) => {
  try {
    const db = database.getDb();
    db.transaction(() => {
      db.prepare(`
        INSERT INTO students (id, name, class_name, reg_no, gender, dob, photo, parent_email, parent_phone, parent_name, fee_status)
        VALUES (@id, @name, @class_name, @reg_no, @gender, @dob, @photo, @parent_email, @parent_phone, @parent_name, @fee_status)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, class_name=excluded.class_name,
          reg_no=excluded.reg_no, gender=excluded.gender, dob=excluded.dob,
          photo=COALESCE(excluded.photo, photo),
          parent_email=excluded.parent_email, parent_phone=excluded.parent_phone,
          parent_name=excluded.parent_name,
          fee_status=excluded.fee_status
      `).run({ id, name, class_name,
        reg_no: reg_no || '', gender: gender || '', dob: dob || '',
        photo: photo || null, parent_email: parent_email || '',
        parent_phone: parent_phone || '', parent_name: parent_name || null,
        fee_status: fee_status || 'cleared'
      });
      db.prepare("DELETE FROM student_subjects WHERE student_id = ?").run(id);
      if (subjects && subjects.length > 0) {
        const stmt = db.prepare("INSERT INTO student_subjects (student_id, subject) VALUES (?, ?)");
        for (const subj of subjects) stmt.run(id, subj);
      }
    })();
    console.log(`[Form] Student added: ${name} with ${subjects?.length || 0} subjects`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Form-based Student Update (“Edit” path) ──────────────────────────────────────
ipcMain.handle("update-student", (event, { id, name, class_name, subjects, reg_no, gender, dob, photo, parent_email, parent_phone, parent_name, fee_status }) => {
  try {
    const db = database.getDb();
    db.transaction(() => {
      if (photo !== undefined && photo !== null) {
        db.prepare(`
          UPDATE students SET name=@name, class_name=@class_name,
            reg_no=@reg_no, gender=@gender, dob=@dob, photo=@photo,
            parent_email=@parent_email, parent_phone=@parent_phone, parent_name=@parent_name,
            fee_status=@fee_status
          WHERE id=@id
        `).run({ id, name, class_name, reg_no: reg_no||'', gender: gender||'', dob: dob||'',
                 photo, parent_email: parent_email||'', parent_phone: parent_phone||'',
                 parent_name: parent_name||null, fee_status: fee_status||'cleared' });
      } else {
        db.prepare(`
          UPDATE students SET name=@name, class_name=@class_name,
            reg_no=@reg_no, gender=@gender, dob=@dob,
            parent_email=@parent_email, parent_phone=@parent_phone, parent_name=@parent_name,
            fee_status=@fee_status
          WHERE id=@id
        `).run({ id, name, class_name, reg_no: reg_no||'', gender: gender||'', dob: dob||'',
                 parent_email: parent_email||'', parent_phone: parent_phone||'',
                 parent_name: parent_name||null, fee_status: fee_status||'cleared' });
      }
      // Replace subject enrollment
      db.prepare("DELETE FROM student_subjects WHERE student_id = ?").run(id);
      if (subjects && subjects.length > 0) {
        const stmt = db.prepare("INSERT INTO student_subjects (student_id, subject) VALUES (?, ?)");
        for (const subj of subjects) stmt.run(id, subj);
      }
    })();
    console.log(`[Form] Student ${id} updated: ${name}, ${subjects?.length || 0} subjects.`);
    return { ok: true };
  } catch (err) {
    console.error('[Form] update-student failed:', err);
    return { ok: false, error: err.message };
  }
});

// ── Directory: Get All Teachers (with allocations) ──────────────────────────
ipcMain.handle("get-all-teachers", (event, { limit = 15, offset = 0, search = "" } = {}) => {
  try {
    const db = database.getDb();
    const query = search ? `%${search}%` : "%";
    
    const total = db.prepare("SELECT COUNT(*) as total FROM teachers WHERE name LIKE ? OR id LIKE ?").get(query, query).total;

    const teachers = db.prepare(`
      SELECT * FROM teachers 
      WHERE name LIKE ? OR id LIKE ? 
      ORDER BY name ASC 
      LIMIT ? OFFSET ?
    `).all(query, query, limit, offset);

    const getAllocs = db.prepare(
      "SELECT class_name, subject FROM teacher_allocations WHERE teacher_id = ? ORDER BY class_name, subject",
    );
    for (const t of teachers) {
      t.allocations = getAllocs.all(t.id);
    }
    return { ok: true, data: teachers, total };
  } catch (err) {
    console.error("[Dir] Failed to get teachers:", err);
    return { ok: false, error: err.message, data: [], total: 0 };
  }
});

// ── Directory: Get All Students ─────────────────────────────────────────
ipcMain.handle("get-all-students", (event, { limit = 15, offset = 0, search = "" } = {}) => {
  try {
    const db = database.getDb();
    const query = search ? `%${search}%` : "%";

    const total = db.prepare("SELECT COUNT(*) as total FROM students WHERE name LIKE ? OR id LIKE ? OR reg_no LIKE ?")
                    .get(query, query, query).total;

    const students = db.prepare(`
      SELECT id, name, class_name, reg_no, gender, dob, photo, parent_email, parent_phone, fee_status 
      FROM students 
      WHERE name LIKE ? OR id LIKE ? OR reg_no LIKE ?
      ORDER BY class_name ASC, name ASC
      LIMIT ? OFFSET ?
    `).all(query, query, query, limit, offset);

    // Attach subject enrollment
    const stmt = db.prepare("SELECT subject FROM student_subjects WHERE student_id = ?");
    for (const student of students) {
      student.subjects = stmt.all(student.id).map(row => row.subject);
    }
    
    return { ok: true, data: students, total };
  } catch (err) {
    console.error("[Dir] Failed to get students:", err);
    return { ok: false, error: err.message, data: [], total: 0 };
  }
});
// ── Subject Consistency Engine ────────────────────────────────────────────────
ipcMain.handle("subjects:get-canonical-list", () => {
  try {
    const db = database.getDb();
    // Return all distinct subjects taught by any teacher, or full allocations if needed.
    // To fix stale lists, we return the canonical mapping.
    const allocations = db.prepare("SELECT teacher_id, class_name, subject FROM teacher_allocations").all();
    return { ok: true, data: allocations };
  } catch (err) {
    console.error("[Subjects] Failed to get canonical list:", err);
    return { ok: false, error: err.message, data: [] };
  }
});

ipcMain.handle("subjects:get-sync-warnings", () => {
  try {
    const db = database.getDb();
    const warnings = db.prepare(`
      SELECT w.id, w.device_id, w.teacher_id, w.student_id, w.mismatched_subject, w.timestamp, 
             t.name as teacher_name, s.name as student_name
      FROM sync_warnings w
      LEFT JOIN teachers t ON w.teacher_id = t.id
      LEFT JOIN students s ON w.student_id = s.id
      ORDER BY w.timestamp DESC LIMIT 50
    `).all();
    return { ok: true, data: warnings };
  } catch (err) {
    console.error("[Subjects] Failed to get sync warnings:", err);
    return { ok: false, error: err.message, data: [] };
  }
});

ipcMain.handle("subjects:clear-sync-warnings", () => {
  try {
    const db = database.getDb();
    db.prepare("DELETE FROM sync_warnings").run();
    return { ok: true };
  } catch (err) {
    console.error("[Subjects] Failed to clear sync warnings:", err);
    return { ok: false, error: err.message };
  }
});

// ── Directory: Delete Teacher ─────────────────────────────────────────────────
ipcMain.handle("delete-teacher", (event, { id }) => {
  try {
    const db = database.getDb();
    // Purge allocations, attributed records, and audit logs before removing
    // the teacher row itself to avoid orphaned foreign key references.
    db.transaction(() => {
      db.prepare("DELETE FROM teacher_allocations WHERE teacher_id = ?").run(id);
      // Null-out teacher attribution in grade records rather than deleting
      // student data — grades remain intact but lose teacher attribution.
      db.prepare("UPDATE student_records SET teacher_id = NULL WHERE teacher_id = ?").run(id);
      db.prepare("UPDATE sync_logs       SET teacher_id = 'DELETED' WHERE teacher_id = ?").run(id);
      db.prepare("DELETE FROM teachers WHERE id = ?").run(id);
    })();
    console.log(`[Dir] Teacher ${id} and all allocations deleted.`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Directory: Delete Student ─────────────────────────────────────────────────
ipcMain.handle("delete-student", (event, { id }) => {
  try {
    const db = database.getDb();
    // Purge all related rows explicitly so no orphans remain,
    // regardless of whether FK cascade is active on this SQLite build.
    db.transaction(() => {
      db.prepare("DELETE FROM student_subjects  WHERE student_id = ?").run(id);
      db.prepare("DELETE FROM student_records   WHERE student_id = ?").run(id);
      db.prepare("DELETE FROM student_domains   WHERE student_id = ?").run(id);
      db.prepare("DELETE FROM teacher_remarks   WHERE student_id = ?").run(id);
      db.prepare("DELETE FROM students          WHERE id         = ?").run(id);
    })();
    console.log(`[Dir] Student ${id} and all related records deleted.`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── V2: Term Configuration ────────────────────────────────────────────────────
ipcMain.handle("get-term-config", () => {
  try {
    const db = database.getDb();
    return db.prepare("SELECT * FROM school_term_config WHERE id = 1").get() || {};
  } catch (err) {
    return {};
  }
});

ipcMain.handle("save-term-config", (event, config) => {
  try {
    const db = database.getDb();
    db.prepare(`
      INSERT INTO school_term_config
        (id, academic_session, term, resumption_date, term_start_date, term_end_date,
         grading_scale, show_position, show_domains, show_attendance, attendance_score_weight, template)
      VALUES
        (1, @academic_session, @term, @resumption_date, @term_start_date, @term_end_date,
         @grading_scale, @show_position, @show_domains, @show_attendance, @attendance_score_weight, @template)
      ON CONFLICT(id) DO UPDATE SET
        academic_session = excluded.academic_session,
        term             = excluded.term,
        resumption_date  = excluded.resumption_date,
        term_start_date  = excluded.term_start_date,
        term_end_date    = excluded.term_end_date,
        grading_scale    = excluded.grading_scale,
        show_position    = excluded.show_position,
        show_domains     = excluded.show_domains,
        show_attendance  = excluded.show_attendance,
        attendance_score_weight = excluded.attendance_score_weight,
        template         = excluded.template
    `).run({
      academic_session: config.academic_session || "2024/2025",
      term:             config.term || "First Term",
      resumption_date:  config.resumption_date  || "",
      term_start_date:  config.term_start_date  || "",
      term_end_date:    config.term_end_date    || "",
      grading_scale: typeof config.grading_scale === "string"
        ? config.grading_scale
        : JSON.stringify(config.grading_scale || []),
      show_position: config.show_position ? 1 : 0,
      show_domains:  config.show_domains  ? 1 : 0,
      show_attendance: config.show_attendance ? 1 : 0,
      attendance_score_weight: Number(config.attendance_score_weight) || 0,
      template:      config.template || "clean_slate",
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Phase 5: Fee Management ───────────────────────────────────────────────────
// Helper — parse fee_settings JSON from app_settings
const _parseFeeSettings = (db) => {
  const raw = db.prepare("SELECT value FROM app_settings WHERE key = 'fee_settings'").get()?.value;
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
};

/**
 * isStudentFeeGated — checks if a student's results should be withheld.
 * termOrNull: pass the active term string for single-term check, or null for ALL terms in the session.
 * Returns { gated: bool, balance: number }
 */
function isStudentFeeGated(db, studentId, session, termOrNull) {
  const s = _parseFeeSettings(db);
  const enabled   = s.fee_gate_enabled !== false; // default on
  const mode      = s.fee_gate_mode      || 'fixed';
  const threshold = Number(s.fee_gate_threshold) || 0;
  if (!enabled) return { gated: false, balance: 0 };

  const balRow = termOrNull
    ? db.prepare(`SELECT COALESCE(SUM(total_billed - total_paid), 0) AS bal FROM student_fees WHERE student_id = ? AND academic_session = ? AND term = ?`).get(studentId, session, termOrNull)
    : db.prepare(`SELECT COALESCE(SUM(total_billed - total_paid), 0) AS bal FROM student_fees WHERE student_id = ? AND academic_session = ?`).get(studentId, session);
  const balance = balRow?.bal || 0;
  if (balance <= 0) return { gated: false, balance: 0 };

  if (mode === 'percent') {
    const billedRow = db.prepare(`SELECT COALESCE(SUM(total_billed), 0) AS b FROM student_fees WHERE student_id = ? AND academic_session = ?`).get(studentId, session);
    const totalBilled = billedRow?.b || 0;
    if (totalBilled <= 0) return { gated: false, balance };
    return { gated: (balance / totalBilled * 100) >= threshold, balance };
  }
  // fixed mode: threshold 0 = any positive balance
  return { gated: threshold === 0 ? balance > 0 : balance >= threshold, balance };
}

/**
 * fees:get-roster — students LEFT-JOINed with student_fees for a given term.
 * balance = total_billed - total_paid is computed dynamically; never stored.
 */
ipcMain.handle("fees:get-roster", (event, { academic_session, term, limit = 15, offset = 0, search = "" }) => {
  try {
    const db = database.getDb();
    const query = search ? `%${search}%` : "%";

    const total = db.prepare("SELECT COUNT(*) as total FROM students WHERE name LIKE ? OR id LIKE ?").get(query, query).total;

    const rows = db.prepare(`
      SELECT
        s.id              AS student_id,
        s.name,
        s.class_name,
        s.parent_phone,
        COALESCE(f.total_billed, 0)                              AS total_billed,
        COALESCE(f.total_paid,   0)                              AS total_paid,
        COALESCE(f.total_billed, 0) - COALESCE(f.total_paid, 0) AS balance,
        COALESCE(f.status,       'unpaid')                       AS status,
        COALESCE(f.next_due_date, '')                            AS next_due_date,
        COALESCE(f.updated_at,   '')                             AS updated_at
      FROM students s
      LEFT JOIN student_fees f
        ON  f.student_id       = s.id
        AND f.academic_session = ?
        AND f.term             = ?
      WHERE s.name LIKE ? OR s.id LIKE ?
      ORDER BY s.class_name ASC, s.name ASC
      LIMIT ? OFFSET ?
    `).all(academic_session, term, query, query, limit, offset);
    
    return { ok: true, data: rows, total };
  } catch (err) {
    console.error("[Fees] get-roster error:", err);
    return { ok: false, error: err.message, data: [], total: 0 };
  }
});

/**
 * fees:upsert — Gold lightweight write. Status is derived server-side.
 */
ipcMain.handle("fees:upsert", (event, { student_id, academic_session, term, total_billed, total_paid, next_due_date }) => {
  try {
    const db = database.getDb();
    const billed = Number(total_billed) || 0;
    const paid   = Number(total_paid)   || 0;
    const status = paid >= billed && billed > 0 ? "cleared"
                 : paid > 0                     ? "partial"
                 : "unpaid";
    db.prepare(`
      INSERT INTO student_fees (student_id, academic_session, term, total_billed, total_paid, status, next_due_date, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(student_id, academic_session, term) DO UPDATE SET
        total_billed  = excluded.total_billed,
        total_paid    = excluded.total_paid,
        status        = excluded.status,
        next_due_date = excluded.next_due_date,
        updated_at    = datetime('now')
    `).run(student_id, academic_session, term, billed, paid, status, next_due_date || "");
    return { ok: true };
  } catch (err) {
    console.error("[Fees] upsert error:", err);
    return { ok: false, error: err.message };
  }
});

/**
 * fees:record-payment — Diamond ledger write.
 * Appends transaction, then recomputes total_paid from the ledger (single source of truth).
 */
ipcMain.handle("fees:record-payment", (event, { student_id, academic_session, term, amount, payment_method, reference_number, note }) => {
  try {
    const db = database.getDb();
    const amt = Number(amount);
    if (!amt || amt <= 0) return { ok: false, error: "Invalid payment amount." };
    db.transaction(() => {
      db.prepare(`
        INSERT INTO fee_transactions (student_id, academic_session, term, amount, payment_method, reference_number, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(student_id, academic_session, term, amt, payment_method || "cash", reference_number || "", note || "");

      const { total_paid } = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) AS total_paid FROM fee_transactions
        WHERE student_id = ? AND academic_session = ? AND term = ?
      `).get(student_id, academic_session, term);

      const existing = db.prepare(`
        SELECT COALESCE(total_billed, 0) AS total_billed FROM student_fees
        WHERE student_id = ? AND academic_session = ? AND term = ?
      `).get(student_id, academic_session, term) || { total_billed: 0 };

      const status = total_paid >= existing.total_billed && existing.total_billed > 0 ? "cleared"
                   : total_paid > 0                                                    ? "partial"
                   : "unpaid";

      db.prepare(`
        INSERT INTO student_fees (student_id, academic_session, term, total_billed, total_paid, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(student_id, academic_session, term) DO UPDATE SET
          total_paid = excluded.total_paid,
          status     = excluded.status,
          updated_at = datetime('now')
      `).run(student_id, academic_session, term, existing.total_billed, total_paid, status);
    })();
    return { ok: true };
  } catch (err) {
    console.error("[Fees] record-payment error:", err);
    return { ok: false, error: err.message };
  }
});

/** fees:get-transactions — ledger history for a student+term (Diamond). */
ipcMain.handle("fees:get-transactions", (event, { student_id, academic_session, term }) => {
  try {
    const db = database.getDb();
    const rows = db.prepare(`
      SELECT id, amount, payment_method, reference_number, note, recorded_by, created_at
      FROM fee_transactions WHERE student_id = ? AND academic_session = ? AND term = ?
      ORDER BY created_at DESC
    `).all(student_id, academic_session, term);
    return { ok: true, data: rows };
  } catch (err) {
    console.error("[Fees] get-transactions error:", err);
    return { ok: false, error: err.message, data: [] };
  }
});

/** fees:get-settings — reminder dates (Gold+) and Fee Shield config (Diamond). */
ipcMain.handle("fees:get-settings", () => {
  try {
    const db = database.getDb();
    return { ok: true, data: _parseFeeSettings(db) };
  } catch (err) {
    return { ok: false, error: err.message, data: {} };
  }
});

/**
 * fees:save-settings — merges patch into existing settings object (partial-update safe).
 * Gold can update reminder_date_1/2; Diamond can also update fee_shield_* keys.
 */
ipcMain.handle("fees:save-settings", (event, patch) => {
  try {
    const db = database.getDb();
    const updated = { ..._parseFeeSettings(db), ...patch };
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('fee_settings', ?)").run(JSON.stringify(updated));
    return { ok: true };
  } catch (err) {
    console.error("[Fees] save-settings error:", err);
    return { ok: false, error: err.message };
  }
});

// ── Phase 6: Attendance Desktop Engine ────────────────────────────────────────

ipcMain.handle("get-daily-attendance", async (event, { class_name, date }) => {
  try {
    const db = database.getDb();
    const records = db.prepare("SELECT * FROM daily_attendance WHERE class_name = ? AND date = ?").all(class_name, date);
    const config = db.prepare("SELECT term_start_date, term_end_date FROM school_term_config WHERE id = 1").get();
    return { 
      ok: true, 
      data: records, 
      term_start_date: config?.term_start_date, 
      term_end_date: config?.term_end_date 
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("save-daily-attendance", async (event, { class_name, date, session, term, records }) => {
  if (!records || records.length === 0) return { ok: true };

  const db = database.getDb();
  const transaction = db.transaction(() => {
    // 1. Bulk Save daily records
    const deleteStmt = db.prepare("DELETE FROM daily_attendance WHERE student_id = ? AND date = ?");
    const insertStmt = db.prepare(`
      INSERT INTO daily_attendance (student_id, class_name, date, status, academic_session, term)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Fetch student details for Guardian Shield alerts
    const studentIds = records.map(r => r.student_id);
    const placeholders = studentIds.map(() => '?').join(',');
    const studentDetails = db.prepare(`SELECT id, name, parent_phone FROM students WHERE id IN (${placeholders})`).all(...studentIds);
    const studentMap = {};
    for (const s of studentDetails) { studentMap[s.id] = s; }

    const enqueueMsg = db.prepare(`
      INSERT INTO pending_pulse_messages (phone, message, type, student_id)
      VALUES (?, ?, 'guardian_alert', ?)
    `);

    for (const r of records) {
      deleteStmt.run(r.student_id, date);
      insertStmt.run(r.student_id, class_name, date, r.status, session, term);

      // Wire Guardian Shield (Absence Alert) to Queue
      if (r.status === 'Absent') {
        const student = studentMap[r.student_id];
        if (student && student.parent_phone) {
          const msg = `🚨 Nexus Guardian Alert:\n\nDear Parent, please be informed that ${student.name} was marked ABSENT from school today (${date}).\n\nIf you are not aware of this, please contact the school immediately.`;
          enqueueMsg.run(student.parent_phone, msg, r.student_id);
        }
      }
    }

    // 2. Synchronize aggregates for Report Cards (Fixing N+1 bug)
    // Run a single aggregation query instead of one per student
    const statsQuery = db.prepare(`
      SELECT student_id, COUNT(*) as total, SUM(CASE WHEN status IN ('Present', 'Late') THEN 1 ELSE 0 END) as attended
      FROM daily_attendance
      WHERE academic_session = ? AND term = ? AND student_id IN (${placeholders})
      GROUP BY student_id
    `).all(session, term, ...studentIds);

    const updateAggStmt = db.prepare(`
      INSERT INTO student_attendance (student_id, academic_session, term, total_days, days_attended)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(student_id, academic_session, term) DO UPDATE SET
      total_days = excluded.total_days,
      days_attended = excluded.days_attended
    `);

    for (const stat of statsQuery) {
      updateAggStmt.run(stat.student_id, session, term, stat.total, stat.attended);
    }
  });

  try {
    transaction();
    return { ok: true };
  } catch (err) {
    console.error("[Attendance] save-daily-attendance error:", err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("get-student-attendance-report", async (event, { student_id }) => {
  try {
    const db = database.getDb();
    const records = db.prepare("SELECT * FROM daily_attendance WHERE student_id = ? ORDER BY date DESC").all(student_id);
    return { ok: true, data: records };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── V2: Query Results (dynamic scope filtering) ───────────────────────────────
ipcMain.handle("query-results", (event, { scope, session, term, class_name, subject, teacher_id, student_id }) => {
  console.log(`[Diagnostic] query-results: scope=${scope}, session=${session}, term=${term}`);
  // ── Silver plan: only 'all' scope permitted ──────────────────────────────
  const _qrTier = licenseStatus?.tier || 'Silver';
  if (_qrTier === 'Silver' && scope && scope !== 'all') {
    return { ok: false, error: 'Generating individual, class, or subject reports requires a Gold or Diamond plan. Contact your Nexus Partner to upgrade.', results: [] };
  }
  try {
    const db = database.getDb();

    // Build student roster depending on scope
    let students;
    if (scope === "student" && student_id) {
      students = db.prepare("SELECT * FROM students WHERE id = ?").all(student_id);
    } else if (scope === "class" && class_name) {
      students = db.prepare("SELECT * FROM students WHERE class_name = ? ORDER BY name ASC").all(class_name);
    } else if (scope === "teacher" && teacher_id) {
      // Students who are enrolled in at least one of this teacher's allocated subjects.
      // The LEFT JOIN + GROUP BY approach keeps students who have student_subjects rows
      // that match; the HAVING clause filters to only those with ≥1 matching enrollment.
      // Falls back gracefully: if a student has NO rows in student_subjects at all
      // (e.g. imported via CSV before the subject fix), they are still included so
      // report data is never silently suppressed for legacy records.
      students = db.prepare(`
        SELECT DISTINCT s.* FROM students s
        JOIN teacher_allocations a ON s.class_name = a.class_name
        WHERE a.teacher_id = ?
          AND (
            -- Student has explicit subject enrollment that matches this teacher's subject
            EXISTS (
              SELECT 1 FROM student_subjects ss
              WHERE ss.student_id = s.id AND ss.subject = a.subject
            )
            OR
            -- Fallback: student has NO subject rows at all (CSV-imported, pre-fix)
            NOT EXISTS (
              SELECT 1 FROM student_subjects ss2
              WHERE ss2.student_id = s.id
            )
          )
        ORDER BY s.class_name, s.name
      `).all(teacher_id);
    } else if (scope === "subject" && subject) {
      students = db.prepare(`
        SELECT DISTINCT s.* FROM students s
        JOIN student_records r ON s.id = r.student_id
        WHERE r.subject = ? AND r.academic_session = ? AND r.term = ?
        ORDER BY s.class_name, s.name
      `).all(subject, session, term);
    } else {
      // All students
      students = db.prepare("SELECT * FROM students ORDER BY class_name, name ASC").all();
    }

    // For each student, fetch their grade records for this session/term
    const getRecords = db.prepare(
      "SELECT subject, score, breakdown FROM student_records WHERE student_id = ? AND academic_session = ? AND term = ?"
    );
    const getDomains = db.prepare(
      "SELECT domain_type, trait, grade FROM student_domains WHERE student_id = ? AND academic_session = ? AND term = ?"
    );
    const getRemark = db.prepare(
      "SELECT remark, principal_remark FROM teacher_remarks WHERE student_id = ? AND academic_session = ? AND term = ?"
    );

    // Aggregate Explicit Subjects 
    const getExplicitSubjects = db.prepare("SELECT subject FROM student_subjects WHERE student_id = ?");
    
    // V2.1 Optimized: Fetch all form teachers into a map once per batch
    const formTeacherMap = new Map();
    db.prepare(`
      SELECT f.class_name, t.name, t.signature 
      FROM form_teachers f
      JOIN teachers t ON f.teacher_id = t.id
    `).all().forEach(ft => formTeacherMap.set(ft.class_name, ft));

    // Gold Phase A: Daily Attendance Aggregation
    const classDaysMap = new Map();
    db.prepare(`
      SELECT class_name, count(DISTINCT date) as total_days 
      FROM daily_attendance 
      WHERE academic_session = ? AND term = ? 
      GROUP BY class_name
    `).all(session, term).forEach(r => classDaysMap.set(r.class_name, r.total_days));

    const getStudentAttendanceCount = db.prepare(`
      SELECT count(*) as days_attended 
      FROM daily_attendance 
      WHERE student_id = ? AND status IN ('Present', 'Late') AND academic_session = ? AND term = ?
    `);

    const results = students.map((stu) => {
      const records = getRecords.all(stu.id, session, term);
      const explicitSubjs = getExplicitSubjects.all(stu.id).map(r => r.subject);

      // Map explicit subjects. If a record exists, use that.
      // If a record exists that ISN'T in explicit subjects, we still include it to avoid data loss.
      const resolvedSubjects = new Map();
      
      explicitSubjs.forEach(sName => {
        resolvedSubjects.set(sName, { name: sName, score: null, breakdown: {} });
      });
      
      records.forEach(r => {
        resolvedSubjects.set(r.subject, {
          name: r.subject,
          score: r.score,
          breakdown: (() => { try { return JSON.parse(r.breakdown); } catch { return {}; } })(),
        });
      });

      let allSubjectsArray = Array.from(resolvedSubjects.values());
      if (scope === "subject" && subject) {
        allSubjectsArray = allSubjectsArray.filter(s => s.name === subject);
      }

      // Filter out zero-score empty subjects so avg isn't polluted by ungraded subjects
      const gradedSubjects = allSubjectsArray.filter(s => s.score !== null);
      const totalScore = gradedSubjects.reduce((sum, s) => sum + s.score, 0);
      const avg = gradedSubjects.length ? (totalScore / gradedSubjects.length).toFixed(1) : "—";

      const domains = getDomains.all(stu.id, session, term);
      const remark = getRemark.get(stu.id, session, term) || {};

      // NEW: Look up form teacher for this class
      const ft = formTeacherMap.get(stu.class_name) || {};

      // NEW: Resolve attendance
      const classTotalDays = classDaysMap.get(stu.class_name) || 0;
      const attRow = getStudentAttendanceCount.get(stu.id, session, term) || { days_attended: 0 };
      const daysAttended = attRow.days_attended;

      // V2.2: Resolve official stamp
      let schoolStamp = identityPacket.stamp || null;
      if (identityPacket.stampStyle && identityPacket.stampStyle !== "none" && !schoolStamp) {
        const stampColor = identityPacket.stampCustomColor || (identityPacket.tier === "Silver" ? "#0D47A1" : identityPacket.themePrimary);
        schoolStamp = generateStampSVG(identityPacket.stampStyle, identityPacket.name, null, identityPacket.signature, stampColor);
      }

      return {
        ...stu,
        subjects: allSubjectsArray,
        total_score: totalScore,
        average: avg,
        domains,
        attendance: {
          total_days: classTotalDays,
          days_attended: daysAttended
        },
        remark: remark.remark || "",
        principal_remark: remark.principal_remark || "",
        form_teacher_name: ft.name || "",
        form_teacher_signature: ft.signature || null,
        // Text name (for calligraphy-style templates like Monarch, Sterling, Apex)
        principal_signature: identityPacket.signature || null,
        // Image signature (for clean_slate, azure and any template using identity.principalSignatureBase64)
        // This is forwarded to report-compiler via the identity object directly — not this per-student field
        principal_stamp: schoolStamp,
      };
    });

    return { ok: true, results, session, term };
  } catch (err) {
    console.error("[query-results] Error:", err.message);
    return { ok: false, error: err.message, results: [] };
  }
});

// ── V2.1: Save Attendance ────────────────────────────────────────────────────
ipcMain.handle("save-attendance", (event, { student_id, session, term, total_days, days_attended }) => {
  try {
    const db = database.getDb();
    db.prepare(`
      INSERT INTO student_attendance (student_id, academic_session, term, total_days, days_attended)
      VALUES (@student_id, @session, @term, @total_days, @days_attended)
      ON CONFLICT(student_id, academic_session, term)
      DO UPDATE SET total_days=excluded.total_days, days_attended=excluded.days_attended
    `).run({ student_id, session, term, total_days: total_days || 0, days_attended: days_attended || 0 });
    return { ok: true };
  } catch (err) {
    console.error('[Attendance] save-attendance failed:', err);
    return { ok: false, error: err.message };
  }
});

// ── V2.1: Get Attendance (by class+session+term) ───────────────────────────────
ipcMain.handle("get-attendance", (event, { class_name, session, term }) => {
  try {
    const db = database.getDb();
    const rows = db.prepare(`
      SELECT sa.student_id, sa.total_days, sa.days_attended,
             (sa.total_days - sa.days_attended) AS days_absent
      FROM student_attendance sa
      JOIN students s ON s.id = sa.student_id
      WHERE (`+ (class_name ? `s.class_name = @class_name AND ` : '') +`
            sa.academic_session = @session AND sa.term = @term)
    `).all({ class_name: class_name || '', session: session || '2024/2025', term: term || 'First Term' });
    return { ok: true, rows };
  } catch (err) {
    console.error('[Attendance] get-attendance failed:', err);
    return { ok: false, error: err.message, rows: [] };
  }
});

// ── V2: Save Domain Scores (Affective / Psychomotor) ─────────────────────────
ipcMain.handle("save-domain-scores", (event, { student_id, session, term, domains }) => {
  try {
    const db = database.getDb();
    const upsert = db.prepare(`
      INSERT INTO student_domains (student_id, academic_session, term, domain_type, trait, grade)
      VALUES (@student_id, @session, @term, @domain_type, @trait, @grade)
      ON CONFLICT(student_id, academic_session, term, domain_type, trait)
      DO UPDATE SET grade = excluded.grade
    `);
    const run = db.transaction(() => {
      for (const d of domains) {
        upsert.run({ student_id, session, term, domain_type: d.domain_type, trait: d.trait, grade: d.grade });
      }
    });
    run();
    
    const adminId = currentAdminSession ? currentAdminSession.id : null;
    db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'UPDATE_DOMAIN_SCORES', 'student_domains', ?)").run(adminId, `Updated affective/psychomotor scores for ${student_id} (${term})`);
    
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── V2: Save Teacher / Principal Remark ──────────────────────────────────────
ipcMain.handle("save-teacher-remark", (event, { student_id, teacher_id, session, term, remark, principal_remark }) => {
  try {
    const db = database.getDb();
    db.prepare(`
      INSERT INTO teacher_remarks (student_id, teacher_id, academic_session, term, remark, principal_remark)
      VALUES (
        @student_id, 
        COALESCE(@teacher_id, (SELECT teacher_id FROM form_teachers WHERE class_name = (SELECT class_name FROM students WHERE id = @student_id))),
        @session, @term, @remark, @principal_remark
      )
      ON CONFLICT(student_id, academic_session, term)
      DO UPDATE SET 
        remark = excluded.remark, 
        principal_remark = excluded.principal_remark,
        teacher_id = COALESCE(excluded.teacher_id, teacher_remarks.teacher_id)
    `).run({ student_id, teacher_id: teacher_id || null, session, term, remark: remark || "", principal_remark: principal_remark || "" });
    
    const adminId = currentAdminSession ? currentAdminSession.id : null;
    db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'UPDATE_REMARKS', 'teacher_remarks', ?)").run(adminId, `Updated remarks for ${student_id} (${term})`);
    
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("save-bulk-remarks", (event, remarksArray) => {
  try {
    const db = database.getDb();
    const insert = db.prepare(`
      INSERT INTO teacher_remarks (student_id, teacher_id, academic_session, term, remark, principal_remark)
      VALUES (
        @student_id, 
        COALESCE(@teacher_id, (SELECT teacher_id FROM form_teachers WHERE class_name = (SELECT class_name FROM students WHERE id = @student_id))),
        @session, @term, @remark, @principal_remark
      )
      ON CONFLICT(student_id, academic_session, term)
      DO UPDATE SET 
        remark = excluded.remark, 
        principal_remark = excluded.principal_remark,
        teacher_id = COALESCE(excluded.teacher_id, teacher_remarks.teacher_id)
    `);
    
    const insertAtt = db.prepare(`
      INSERT INTO student_attendance (student_id, academic_session, term, total_days, days_attended)
      VALUES (@student_id, @session, @term, @total_days, @days_attended)
      ON CONFLICT(student_id, academic_session, term)
      DO UPDATE SET total_days=excluded.total_days, days_attended=excluded.days_attended
    `);

    const transaction = db.transaction((remarks) => {
      for (const r of remarks) {
        insert.run({
          student_id: r.student_id,
          teacher_id: r.teacher_id || null,
          session: r.session,
          term: r.term,
          remark: r.remark || "",
          principal_remark: r.principal_remark || ""
        });

        // Also sync attendance if provided
        if (r.total_days !== undefined) {
          insertAtt.run({
            student_id: r.student_id,
            session: r.session,
            term: r.term,
            total_days: r.total_days || 0,
            days_attended: r.days_attended || 0
          });
        }
      }
    });

    transaction(remarksArray);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── V2.2: Dynamic Stamp Engine ──────────────────────────────────────────────
function generateStampSVG(style, schoolName, date, principalName, color = "#0D47A1") {
  const name = (schoolName || "NEXUS ACADEMY").toUpperCase();
  const dateStr = date || new Date().toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" });
  const pName = (principalName || "").toUpperCase();
  
  if (style === "classic_round") {
    return `data:image/svg+xml;base64,${Buffer.from(`
      <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <circle cx="100" cy="100" r="95" fill="none" stroke="${color}" stroke-width="3" />
        <circle cx="100" cy="100" r="80" fill="none" stroke="${color}" stroke-width="1.5" />
        <path id="curve" d="M 30,100 A 70,70 0 1,1 170,100" fill="none" />
        <text fill="${color}" font-family="Inter, sans-serif" font-weight="900" font-size="16">
          <textPath href="#curve" startOffset="50%" text-anchor="middle">${name}</textPath>
        </text>
        <path id="curve-bottom" d="M 30,100 A 70,70 0 1,0 170,100" fill="none" />
        <text fill="${color}" font-family="Inter, sans-serif" font-weight="700" font-size="12">
          <textPath href="#curve-bottom" startOffset="50%" text-anchor="middle">OFFICIAL SEAL</textPath>
        </text>
        <text x="100" y="105" fill="${color}" font-family="Inter, sans-serif" font-weight="800" font-size="14" text-anchor="middle">${dateStr}</text>
        <text x="100" y="125" fill="${color}" font-family="Inter, sans-serif" font-weight="600" font-size="9" text-anchor="middle">${pName}</text>
      </svg>
    `).toString("base64")}`;
  }
  
  if (style === "modern_rect") {
    return `data:image/svg+xml;base64,${Buffer.from(`
      <svg width="240" height="100" viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="5" width="230" height="90" rx="8" fill="none" stroke="${color}" stroke-width="4" />
        <line x1="5" y1="30" x2="235" y2="30" stroke="${color}" stroke-width="2" />
        <text x="120" y="22" fill="${color}" font-family="Inter, sans-serif" font-weight="900" font-size="12" text-anchor="middle">${name}</text>
        <text x="120" y="65" fill="${color}" font-family="Inter, sans-serif" font-weight="950" font-size="28" text-anchor="middle">APPROVED</text>
        <text x="120" y="88" fill="${color}" font-family="Inter, sans-serif" font-weight="700" font-size="12" text-anchor="middle">${dateStr}</text>
      </svg>
    `).toString("base64")}`;
  }

  if (style === "ribbon_endorse") {
    return `data:image/svg+xml;base64,${Buffer.from(`
      <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <path d="M100 10 L115 45 L150 45 L120 70 L135 105 L100 85 L65 105 L80 70 L50 45 L85 45 Z" fill="none" stroke="${color}" stroke-width="3" />
        <circle cx="100" cy="55" r="40" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="4" />
        <text x="100" y="140" fill="${color}" font-family="Inter, sans-serif" font-weight="900" font-size="14" text-anchor="middle">${name}</text>
        <text x="100" y="160" fill="${color}" font-family="Inter, sans-serif" font-weight="700" font-size="16" text-anchor="middle">CERTIFIED</text>
        <text x="100" y="180" fill="${color}" font-family="Inter, sans-serif" font-weight="600" font-size="12" text-anchor="middle">${dateStr}</text>
      </svg>
    `).toString("base64")}`;
  }
  
  if (style === "minimal_sig") {
    return `data:image/svg+xml;base64,${Buffer.from(`
      <svg width="200" height="80" viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg">
        <line x1="20" y1="50" x2="180" y2="50" stroke="${color}" stroke-width="2" />
        <text x="100" y="40" fill="${color}" font-family="Inter, sans-serif" font-weight="700" font-size="12" text-anchor="middle">OFFICIALLY SIGNED</text>
        <text x="100" y="65" fill="${color}" font-family="Inter, sans-serif" font-weight="800" font-size="14" text-anchor="middle">${dateStr}</text>
        <text x="100" y="75" fill="${color}" font-family="Inter, sans-serif" font-weight="500" font-size="8" text-anchor="middle">${name}</text>
      </svg>
    `).toString("base64")}`;
  }

  return null;
}

ipcMain.handle("get-stamp-preview", (event, { style, color }) => {
  return generateStampSVG(style, identityPacket.name, null, identityPacket.signature, color);
});

ipcMain.handle("get-form-teachers", () => {
  try {
    const db = database.getDb();
    const rows = db.prepare(`
      SELECT f.class_name, f.teacher_id, t.name as teacher_name 
      FROM form_teachers f
      JOIN teachers t ON f.teacher_id = t.id
    `).all();
    return { ok: true, data: rows };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("set-form-teacher", (event, { class_name, teacher_id }) => {
  try {
    const db = database.getDb();
    if (!teacher_id) {
      db.prepare(`DELETE FROM form_teachers WHERE class_name = ?`).run(class_name);
      return { ok: true };
    }
    db.prepare(`
      INSERT INTO form_teachers (class_name, teacher_id)
      VALUES (?, ?)
      ON CONFLICT(class_name) DO UPDATE SET teacher_id = excluded.teacher_id
    `).run(class_name, teacher_id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});





ipcMain.handle("save-identity", (event, newIdentity) => {
  try {
    // Ensure identityFilePath is set
    if (!identityFilePath) {
      const userDataPath = require('electron').app.getPath("userData");
      identityFilePath = require('path').join(userDataPath, "identity.json");
    }

    identityPacket = { ...identityPacket, ...newIdentity };
    fs.writeFileSync(identityFilePath, JSON.stringify(identityPacket, null, 2));
    console.log("[Electron] Identity saved locally.");

    // ── Keep app_settings.school_name in sync so pulse-bot.js and
    // pulse-exporter.js (which read from the DB) always use the correct name.
    if (identityPacket.name) {
      try {
        const db = database.getDb();
        db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('school_name', ?)").run(identityPacket.name);
      } catch (dbErr) {
        console.warn("[Identity] Could not sync school_name to DB:", dbErr.message);
      }
    }

    if (qrPayload) {
      qrPayload.config = identityPacket;
      setSchoolConfig(qrPayload.config);
      if (mainWindow) mainWindow.webContents.send("qr-payload", qrPayload);
    }

    return { ok: true, identity: { ...identityPacket, tier: licenseStatus?.tier || "Silver" } };
  } catch (err) {
    console.error("Failed to save identity:", err);
    return { ok: false, error: err.message };
  }
});

console.log("[Electron] Registering generate-reports handler...");
// ── Window Controls (for custom frameless titlebar) ───────────────────────────
ipcMain.on("win-minimize", () => {
  if (mainWindow) mainWindow.minimize();
});
ipcMain.on("win-maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on("win-close", () => {
  if (mainWindow) mainWindow.close();
});
ipcMain.handle("get-platform", () => process.platform);

ipcMain.handle("revoke-device", async (event, deviceId) => {
  console.log(`[License] Revoking device: ${deviceId}`);
  revokeDevice(deviceId);
  if (mainWindow) {
    mainWindow.webContents.send("revoke-broadcast", deviceId);
  }
  return { ok: true };
});

// Pulse heartbeat bridge for Phase 3.1 UDP packets
ipcMain.handle('pulse-bridge-ready', () => {
    // This is just to acknowledge UI is ready to receive
    return true;
});

ipcMain.handle("reset-app-data", async () => {
  console.log("[Electron] Resetting app data...");

  // 1. Reset identity packet to default
  identityPacket = {
    name: "Green Valley High",
    themePrimary: "#1A237E",
    themeSecondary: "#00E5FF",
    logoBase64: null,
    address: "",
    motto: "",
    signature: "",
  };

  // 2. Clear identity.json
  try {
    if (identityFilePath && fs.existsSync(identityFilePath)) {
      fs.unlinkSync(identityFilePath);
      console.log("[Electron] identity.json deleted.");
    }
  } catch (err) {
    console.error("Failed to delete identity.json", err);
  }

  // 3. Clear server data (students)
  clearData();

  // 4. Update QR Payload
  if (qrPayload) {
    qrPayload.config = identityPacket;
    setSchoolConfig(qrPayload.config);
  }

  // 5. Notify UI
  if (mainWindow) {
    mainWindow.webContents.send("qr-payload", qrPayload);
  }

  return true;
});
// ── Last image path for clipboard ─────────────────────────────────────────────
let _lastImagePath = null;

ipcMain.handle("copy-result-image", async (event, { imagePath } = {}) => {
  const target = imagePath || _lastImagePath;
  if (!target || !fs.existsSync(target)) return { ok: false, error: "No image found" };
  const img = nativeImage.createFromPath(target);
  clipboard.writeImage(img);
  return { ok: true };
});

// ── Shared helpers ─────────────────────────────────────────────────────────────
// Templates Extracted to @nexus/engine
console.log("[Electron] Registering generate-reports handler...");
ipcMain.handle("generate-reports", async (event, payload) => {
  const { termConfig, reportType = "terminal", format = "pdf" } = payload || {};
  try {
    const outFolder = path.join(app.getPath("desktop"), "NexusReports");
    if (!fs.existsSync(outFolder)) fs.mkdirSync(outFolder, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

    const db = database.getDb();
    if (payload.students) {
      for (const s of payload.students) {
        // Fee Shield Check — status lives in student_fees, not fee_transactions
        try {
          const feeStatus = db.prepare(
            `SELECT status FROM student_fees WHERE student_id = ? AND academic_session = ? AND term = ? LIMIT 1`
          ).get(s.id, termConfig?.academic_session, termConfig?.term);
          s.feeStatus = feeStatus?.status ?? 'unpaid';
        } catch (feeErr) {
          s.feeStatus = 'unpaid'; // non-fatal — proceed without fee status
        }

        // Subject Attendance Aggregation (Diamond Tier)
        try {
            const subAtt = db.prepare(`SELECT subject_name, total_classes, classes_attended FROM subject_attendance_agg WHERE student_id = ? AND academic_session = ? AND term = ?`).all(s.id, termConfig?.academic_session, termConfig?.term);
            if (subAtt && subAtt.length > 0) s.subject_attendance_agg = subAtt;
        } catch (e) { /* ignore if table not ready */ }
      }
    }

    let html = "";
    let outPath = "";
    const baseDir = path.join(__dirname, "../../private_engine");
    
    if (reportType === "portal_card") {
        html = reports.generatePortalCards(payload);
        outPath = path.join(outFolder, `Parent_Access_Cards_${timestamp}.${format === "image" ? "png" : "pdf"}`);
    } else if (reportType !== "broadsheet") {
        html = reports.generateHTMLPages(payload, baseDir);
        outPath = path.join(outFolder, `TerminalReport_${termConfig?.term?.replace(/\s/g,"_")||"Term"}_${timestamp}.${format === "image" ? "png" : "pdf"}`);
    } else {
        html = reports.generateBroadsheetHTML(payload);
        outPath = path.join(outFolder, `Broadsheet_${payload.subject?.replace(/\s/g,"_")}_${timestamp}.${format === "image" ? "png" : "pdf"}`);
    }

    if (format === "html") {
         outPath = outPath.replace(".pdf", ".html").replace(".png", ".html");
         fs.writeFileSync(outPath, html, "utf8");
         require('electron').shell.openPath(outFolder);
         return { success: true, path: outPath, folder: outFolder, format };
    }

    // Write to a robust temp file to bypass Windows Chromium data:URL string length truncation
    const tempHtmlPath = path.join(app.getPath("desktop"), `nexus_report_temp_${Date.now()}.html`);
    fs.writeFileSync(tempHtmlPath, html, "utf8");

    await new Promise((resolve, reject) => {
        let hw = new BrowserWindow({ show: false, width: 794, height: 1123, webPreferences: { offscreen: true } });
        hw.loadFile(tempHtmlPath);
        hw.webContents.on("did-finish-load", async () => {
          try {
            if (format === "image") {
              const image = await hw.webContents.capturePage();
              fs.writeFileSync(outPath, image.toPNG());
            } else {
              const buf = await hw.webContents.printToPDF({ printBackground: true, pageSize: "A4", landscape: (reportType === "broadsheet") });
              fs.writeFileSync(outPath, buf);
            }
            hw.close(); hw = null;
            // Clean up temp file
            if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);
            resolve();
          } catch(e) { hw?.close(); reject(e); }
        });
    });

    require('electron').shell.openPath(outFolder);
    return { success: true, path: outPath, folder: outFolder, format };

  } catch (err) {
    console.error(`[Electron] Report generation failed:`, err);
    throw err;
  }
});







function createWindow() {
  // ── Initialize Persistence First ──────────────────────────────────────────
  try {
    const userDataPath = app.getPath("userData");
    identityFilePath = path.join(userDataPath, "identity.json");

    // Initialize SQLite Database
    let dbPath = path.join(userDataPath, 'nexus_os.db');
    scholar.init(userDataPath);
    
    // DEMO MODE: Prioritize the seeded DB in the project root if it exists
    const repoDbPath = path.join(__dirname, "../../private_engine/nexus.sqlite");
    if (fs.existsSync(repoDbPath)) {
        dbPath = repoDbPath;
    }
    
    const betterSqlite3 = require("better-sqlite3");
    database.init(dbPath, betterSqlite3);
    
    // FINAL DEMO CHECK: Print the number of records found
    try {
        const db = database.getDb();
        const count = db.prepare("SELECT COUNT(*) as c FROM student_records").get().c;
        console.log(`\n[Database] HARDENED SYNC CHECK: FOUND ${count} GRADE RECORDS\n`);
    } catch(e) {
        console.warn("[Database] Sync Check Failed (Likely new DB):", e.message);
    }

    if (fs.existsSync(identityFilePath)) {
      const data = fs.readFileSync(identityFilePath, "utf-8");
      identityPacket = JSON.parse(data);
      // Sync the private_engine server's school_config so the handshake
      // payload reflects the saved identity on every cold start.
      setSchoolConfig(identityPacket);
      // ── Keep app_settings.school_name in sync so pulse-bot.js and
      // pulse-exporter.js (which read from the DB) always use the correct name.
      try {
        const db = database.getDb();
        if (identityPacket.name) {
          db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('school_name', ?)").run(identityPacket.name);
        }
      } catch (_) { /* DB not yet ready on very first boot — seeded default is fine */ }
      console.log(`[Electron] Identity loaded → school: "${identityPacket.name || 'N/A'}"`);
    } else {
      fs.writeFileSync(
        identityFilePath,
        JSON.stringify(identityPacket, null, 2),
      );
    }
  } catch (err) {
    console.error("Failed to load/save identity.json or initialize DB", err);
  }

  // ── Auto-updater (electron-updater + GitHub Releases) ───────────────────────
  // Only active in production builds. Silently downloads; user triggers install.
  let _updaterAvailable = false;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload    = true;  // download silently in background
    autoUpdater.autoInstallOnAppQuit = false; // let the user trigger install
    autoUpdater.on('update-available',  (info) => { _updaterAvailable = true;  mainWindow?.webContents.send('update-available',  info); });
    autoUpdater.on('update-downloaded', (info) => { mainWindow?.webContents.send('update-downloaded', info); });
    autoUpdater.on('download-progress', (p)    => { mainWindow?.webContents.send('update-progress',   p);    });
    autoUpdater.on('error',             (err)  => { mainWindow?.webContents.send('update-error', err.message); });
    // Check 30s after launch so it doesn't compete with app startup
    setTimeout(() => { try { autoUpdater.checkForUpdates(); } catch {} }, 30_000);
    ipcMain.handle('updater:check',   () => autoUpdater.checkForUpdates());
    ipcMain.handle('updater:install', () => { autoUpdater.quitAndInstall(false, true); });
  } catch (e) {
    // electron-updater not yet installed — no-op
    ipcMain.handle('updater:check',   () => ({ available: false }));
    ipcMain.handle('updater:install', () => {});
  }

  // ── App menu ─────────────────────────────────────────────────────────────────
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'NexusSchoolOS',
        submenu: [
          {
            label: 'About NexusSchoolOS',
            click: () => mainWindow?.webContents.send('navigate-to', 'about'),
          },
          { type: 'separator' },
          { role: 'quit' }
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
          { role: 'cut'  }, { role: 'copy' }, { role: 'paste'     },
          { role: 'delete' }, { role: 'selectall' }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Check for Updates',
            click: async () => {
              try {
                const { autoUpdater } = require('electron-updater');
                autoUpdater.checkForUpdates();
              } catch {
                dialog.showMessageBox(mainWindow, {
                  title:   'Updates',
                  message: 'Auto-updater not available in this build.',
                  buttons: ['OK'],
                });
              }
            },
          },
          {
            label: 'Open Portal',
            click: () => shell.openExternal(process.env.NEXUSOS_PORTAL_URL || 'https://nexusos.com.ng/portal'),
          },
        ],
      },
    ])
  );

  // Load Icon
  const iconPath = path.join(__dirname, "assets", "icon.png");
  let appIcon = null;
  if (fs.existsSync(iconPath)) {
    appIcon = nativeImage.createFromPath(iconPath);
    if (process.platform === "darwin" && app.dock) {
      app.dock.setIcon(appIcon);
    }
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    // On macOS: keep native traffic lights inset in the top-left corner
    // On Windows/Linux: fully frameless, we draw custom chrome in HTML
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 14, y: 16 },
    frame: process.platform !== "darwin", // frameless on Windows/Linux
    backgroundColor: "#0A0E2E",
  });

  // (app name already set at module scope)
  // ── Boot: load lock screen first, unless developer bypass is active ────────
  // Set DEV_AUTO_LOGIN=true in .env to skip auth during testing and go straight
  // to the main app. This flag must NEVER appear in production builds.
  let bootFile = 'lock.html';
  if (process.env.DEV_AUTO_LOGIN === 'true') {
    currentAdminSession = { id: 1, name: 'Developer', role: 'super_admin', loginAt: Date.now() };
    console.log('[Auth] DEV_AUTO_LOGIN active — skipping lock screen.');
    bootFile = process.env.USE_REACT_UI === 'true' ? 'renderer.html' : 'index.html';
  }
  mainWindow.loadFile(bootFile);


  // Start the message queue worker now that the main window exists
  startMessageQueueWorker();

  pulseBot.initPulseBot(mainWindow);
  const dbApp = database.getDb();
  const autoStart = dbApp.prepare("SELECT value FROM app_settings WHERE key = 'pulse_autostart'").get();
  if (autoStart && autoStart.value === 'true') {
    console.log('[Pulse] Auto-start is enabled. Starting bot...');
    pulseBot.startPulse();
  }

  pulseExporter.onSyncError = (message) => {
      if (mainWindow) mainWindow.webContents.send("pulse:sync-error", message);
  };

  // Init the exporter now so oAuth2Client is ready if credentials exist.
  // Periodic sync is started AFTER the license tier is determined (see below).
  pulseExporter.init().catch(e => console.error('[Pulse] Exporter init error:', e));

  // Small callback server for Google Auth
  const callbackServer = express();
  callbackServer.get('/google-callback', async (req, res) => {
      const { code } = req.query;
      if (code && pulseExporter.oAuth2Client) {
          try {
              const { tokens } = await pulseExporter.oAuth2Client.getToken(code);
              const db = database.getDb();
              db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('google_tokens', ?)").run(JSON.stringify(tokens));
              pulseExporter.oAuth2Client.setCredentials(tokens);
              pulseExporter.startPeriodicSync();
              res.send("<h1>Authentication Successful!</h1><p>You can close this window now.</p>");
              if (mainWindow) mainWindow.webContents.send("pulse:cloud-synced");
          } catch (err) {
              res.status(500).send("Authentication failed: " + err.message);
          }
      } else {
          res.send("Invalid callback.");
      }
  });
  callbackServer.listen(3005, () => console.log("[Pulse] Google Auth callback server listening on port 3005"));

  // ── Dev shortcuts: Cmd+R → reload, Cmd+Option+I → DevTools ───────────────
  globalShortcut.register("CommandOrControl+R", () => {
    if (mainWindow) mainWindow.webContents.reload();
  });
  globalShortcut.register("CommandOrControl+Alt+I", () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools();
  });

  // Start the Handshake Server
  const port = 3000;
  const serverInstance = startServer(port); // Returns the event emitter

  serverInstance.on('capacity-alert', (data) => {
    console.warn(`[License] Capacity Limit Breached during sync! ${data.totalFailed} students rejected.`);
    if (mainWindow) {
      mainWindow.webContents.send("show-upgrade-modal", { reason: "capacity_reached", detail: data });
    }
  });

  serverInstance.on('attendance-alert', async (data) => {
    const { student_id, date } = data;
    try {
        const db = database.getDb();
        const student = db.prepare("SELECT name, parent_phone FROM students WHERE id = ?").get(student_id);
        
        if (student && student.parent_phone) {
            console.log(`[Guardian Shield] Triggering Attendance Alert for ${student.name} (${student.parent_phone})`);
            await pulseBot.sendAttendanceAlert(student.parent_phone, student.name, identityPacket.name || "Nexus School", date);
        }
    } catch (err) {
        console.error("[Guardian Shield] Alert Failed:", err);
    }
  });

  // ── Phase 3.1: The Pulse (UDP Listener) ────────────────────────────
  const udpServer = dgram.createSocket('udp4');
  udpServer.on('error', (err) => {
    console.warn(`[Pulse] UDP server error:\n${err.stack}`);
    udpServer.close();
  });
  udpServer.on('message', (msg, rinfo) => {
    try {
      const payload = JSON.parse(msg.toString());
      if (mainWindow) {
        mainWindow.webContents.send("pulse-heartbeat", payload);
      }
    } catch (e) { /* ignore invalid JSON */ }
  });
  udpServer.on('listening', () => {
    const address = udpServer.address();
    console.log(`[Pulse] Heartbeat server listening on ${address.address}:${address.port}`);
  });
  udpServer.bind(3001);

  // ── Phase 3.2: Local Parent Portal (Gold/Diamond) ──────────────────
  const portalApp = express();
  const portalPort = 3002;
  const portalSessions = new Map(); // phone -> { pin, expiry, students }
  const activeTokens = new Map();   // token -> { phone, expiry, students }

  // Broadcast the portal on the local network
  function startPortalBroadcaster() {
    const schoolName = identityPacket.name || "Nexus";
    const name = schoolName.split(' ')[0].toLowerCase();
    
    bonjour.publish({
      name: `${name}.nexus`,
      type: 'http',
      port: portalPort,
      txt: { path: '/portal' }
    });
    console.log(`[Gold Portal] Broadcasting as http://${name}.nexus.local`);
  }

  portalApp.use(express.json());

  portalApp.get('/portal', (req, res) => {
    res.sendFile(path.join(__dirname, 'portal.html'));
  });

  // Identity for self-branding (The Nexus Mask — portal.html calls this on load)
  portalApp.get('/portal/api/identity', (req, res) => {
    const schoolName = identityPacket?.name || "Nexus";
    const namePart   = schoolName.split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
    res.json({
      ok:         true,
      schoolName,
      brandUrl:   `http://${namePart}.edu.nexus`,
      logoBase64: identityPacket?.logoBase64 || null,
      themePrimary: identityPacket?.themePrimary || null,
      themeSecondary: identityPacket?.themeSecondary || null
    });
  });

  // Rate limiting store: { ip: { count, resetAt } }
  const otpRateLimits = new Map();

  // Step 1: Request Access via Phone Number
  portalApp.post('/portal/api/request-otp', async (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const hourLimit = 60 * 60 * 1000;

    // Check rate limit
    let limitData = otpRateLimits.get(ip);
    if (!limitData || limitData.resetAt < now) {
      limitData = { count: 0, resetAt: now + hourLimit };
    }
    if (limitData.count >= 5) {
      return res.json({ ok: false, error: 'Rate limit exceeded. Please try again in an hour.' });
    }
    limitData.count++;
    otpRateLimits.set(ip, limitData);

    const { phone } = req.body;
    if (!phone) return res.json({ ok: false, error: 'Phone number required' });

    try {
      const db = database.getDb();
      const matchable = phone.replace(/\D/g, "").slice(-10);
      
      const students = db.prepare("SELECT id, name, class_name FROM students WHERE parent_phone LIKE ?").all(`%${matchable}`);
      if (!students.length) return res.json({ ok: false, error: `No students found for this number. Ensure it matches the number registered at the school (last 10 digits used: ${matchable}).` });

      const pin = Math.floor(1000 + Math.random() * 9000).toString();
      const expiry = Date.now() + (12 * 60 * 60 * 1000); // 12 Hours
      
      portalSessions.set(matchable, { pin, expiry, students });

      // Send via WhatsApp Bot or push to Queue
      try {
        const botStatus = await pulseBot.getPulseStatus();
        if (botStatus && botStatus.status === 'ready') {
          await pulseBot.sendOTP(phone, pin, identityPacket.name || "Nexus School");
          res.json({ ok: true, message: 'OTP sent via WhatsApp' });
        } else {
          // Push to pending queue so worker sends it when bot comes online
          db.prepare(`
            INSERT INTO pending_pulse_messages (phone, message, type)
            VALUES (?, ?, 'otp')
          `).run(phone, `Nexus Portal Login PIN: ${pin}`);
          
          res.json({ ok: true, message: 'WhatsApp delivery queued. Please ensure Nexus Pulse is online.' });
        }
      } catch (e) {
        console.error("[Portal] WhatsApp failed:", e);
        res.json({ ok: false, error: 'WhatsApp delivery failed. Message queued.' });
      }
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  });

  // Step 2: Verify PIN and Get Session Token
  portalApp.post('/portal/api/verify-otp', (req, res) => {
    const { phone, pin } = req.body;
    const matchable = phone.replace(/\D/g, "").slice(-10);
    const session = portalSessions.get(matchable);

    if (!session || session.pin !== pin || Date.now() > session.expiry) {
      return res.json({ ok: false, error: 'Invalid or expired PIN' });
    }

    // Burn the PIN — true one-time use. The 12-hour clock lives on the access token.
    portalSessions.delete(matchable);

    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + (12 * 60 * 60 * 1000); // 12 hours from verification
    activeTokens.set(token, { phone: matchable, students: session.students, expiry });

    res.json({ ok: true, token, students: session.students });
  });

  // Step 3: Get Student Data (Authorized)
  // Special studentId value '__list__' resumes a session: validates the token
  // and returns the student roster without fetching full academic data.
  portalApp.get('/portal/api/student-data', async (req, res) => {
    const { token, studentId } = req.query;
    const session = activeTokens.get(token);

    if (!session || Date.now() > session.expiry) {
      return res.status(401).json({ ok: false, error: 'Session expired' });
    }

    // Session-resumption shortcut: return the student list only
    if (studentId === '__list__') {
      return res.json({ ok: true, students: session.students });
    }

    // Ensure student belongs to this parent
    if (studentId && !session.students.find(s => s.id === studentId)) {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }

    try {
      const db = database.getDb();
      const id = studentId || session.students[0].id;
      
      const student = db.prepare("SELECT id, name, class_name FROM students WHERE id = ?").get(id);
      const termConfig = db.prepare("SELECT * FROM school_term_config WHERE id = 1").get();
      const schoolName = identityPacket.name || "Nexus School";

      const results = db.prepare(`
        SELECT subject, score FROM student_records 
        WHERE student_id = ? AND academic_session = ? AND term = ?
      `).all(id, termConfig.academic_session, termConfig.term);

      const attendance = db.prepare(`
        SELECT status, date FROM daily_attendance 
        WHERE student_id = ? AND academic_session = ? AND term = ?
      `).all(id, termConfig.academic_session, termConfig.term);

      const fees = db.prepare(`
        SELECT total_billed, total_paid FROM student_fees 
        WHERE student_id = ? AND academic_session = ? AND term = ?
      `).get(id, termConfig.academic_session, termConfig.term) || { total_billed: 0, total_paid: 0 };

      // ── Fee Gate (Gold / Diamond only — Silver has no financial module) ────
      const _portalTier = licenseStatus?.tier || 'Silver';
      let resultsBlocked = false;
      let resultsBlockedMsg = '';
      let resultsBlockedBalance = 0;
      if (_portalTier !== 'Silver') {
        try {
          const gateResult = isStudentFeeGated(db, id, termConfig.academic_session, termConfig.term);
          if (gateResult.gated) {
            resultsBlocked = true;
            resultsBlockedBalance = gateResult.balance;
            resultsBlockedMsg = `Your child's academic results are currently withheld pending fee clearance. Outstanding balance: ₦${Number(gateResult.balance).toLocaleString('en-NG')}. Please contact the school bursar to resolve this.`;
          }
        } catch (feeGateErr) {
          console.warn('[Portal] Fee gate check failed (non-fatal):', feeGateErr.message);
        }
      }

      // Pull bank account details from settings (Gold+)
      let bankAccounts = [];
      try {
        const fsr = db.prepare(`SELECT value FROM app_settings WHERE key='fee_settings'`).get();
        if (fsr) bankAccounts = JSON.parse(fsr.value).bank_accounts || [];
      } catch(_) {}

      res.json({
        ok: true,
        schoolName,
        termConfig,
        student,
        results: resultsBlocked ? [] : results,
        resultsBlocked,
        resultsBlockedMsg,
        resultsBlockedBalance,
        attendance,
        fees,
        bankAccounts
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Ensure portal content tables exist (idempotent) ─────────────────────────
  try {
    const _db = database.getDb();
    _db.exec(`
      CREATE TABLE IF NOT EXISTS portal_news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, body TEXT NOT NULL,
        category TEXT DEFAULT 'general', is_published INTEGER DEFAULT 1,
        created_at TEXT, updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS portal_policies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, body TEXT NOT NULL,
        order_num INTEGER DEFAULT 0, is_published INTEGER DEFAULT 1,
        created_at TEXT, updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS payment_receipts (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id           TEXT    NOT NULL,
        submitted_via        TEXT    NOT NULL DEFAULT 'portal',
        file_data_b64        TEXT,
        file_type            TEXT,
        extracted_amount     REAL,
        extracted_reference  TEXT,
        extracted_date       TEXT,
        extracted_payer_name TEXT,
        extracted_bank       TEXT,
        extracted_confidence REAL,
        name_match_score     REAL,
        pdf_raw_text         TEXT,
        ai_raw_response      TEXT,
        status               TEXT    NOT NULL DEFAULT 'pending',
        reviewed_by          TEXT,
        reviewed_at          DATETIME,
        rejection_reason     TEXT,
        academic_session     TEXT,
        term                 TEXT,
        created_at           DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (_) {}

  // ── Public portal content endpoints ──────────────────────────────────────────
  portalApp.get('/portal/api/news', (req, res) => {
    try {
      const db = database.getDb();
      const rows = db.prepare(
        'SELECT id,title,body,category,created_at FROM portal_news WHERE is_published=1 ORDER BY id DESC'
      ).all();
      res.json({ ok: true, news: rows });
    } catch (e) { res.json({ ok: false, news: [], error: e.message }); }
  });

  portalApp.get('/portal/api/policies', (req, res) => {
    try {
      const db = database.getDb();
      const rows = db.prepare(
        'SELECT id,title,body,order_num FROM portal_policies WHERE is_published=1 ORDER BY order_num ASC, id ASC'
      ).all();
      res.json({ ok: true, policies: rows });
    } catch (e) { res.json({ ok: false, policies: [], error: e.message }); }
  });

  // ── Admin content CRUD (IPC — only accessible from Electron window) ───────────
  ipcMain.handle('portal-content:get-all', () => {
    const db = database.getDb();
    return {
      news:     db.prepare('SELECT * FROM portal_news     ORDER BY id DESC').all(),
      policies: db.prepare('SELECT * FROM portal_policies ORDER BY order_num ASC, id ASC').all()
    };
  });

  ipcMain.handle('portal-content:save-news', (_, item) => {
    const db  = database.getDb();
    const now = new Date().toISOString();
    if (item.id) {
      db.prepare('UPDATE portal_news SET title=?,body=?,category=?,is_published=?,updated_at=? WHERE id=?')
        .run(item.title, item.body, item.category||'general', item.is_published??1, now, item.id);
    } else {
      db.prepare('INSERT INTO portal_news (title,body,category,is_published,created_at,updated_at) VALUES (?,?,?,?,?,?)')
        .run(item.title, item.body, item.category||'general', item.is_published??1, now, now);
    }
    return { ok: true };
  });

  ipcMain.handle('portal-content:delete-news', (_, id) => {
    database.getDb().prepare('DELETE FROM portal_news WHERE id=?').run(id);
    return { ok: true };
  });

  ipcMain.handle('portal-content:save-policy', (_, item) => {
    const db  = database.getDb();
    const now = new Date().toISOString();
    if (item.id) {
      db.prepare('UPDATE portal_policies SET title=?,body=?,order_num=?,is_published=?,updated_at=? WHERE id=?')
        .run(item.title, item.body, item.order_num||0, item.is_published??1, now, item.id);
    } else {
      db.prepare('INSERT INTO portal_policies (title,body,order_num,is_published,created_at,updated_at) VALUES (?,?,?,?,?,?)')
        .run(item.title, item.body, item.order_num||0, item.is_published??1, now, now);
    }
    return { ok: true };
  });

  ipcMain.handle('portal-content:delete-policy', (_, id) => {
    database.getDb().prepare('DELETE FROM portal_policies WHERE id=?').run(id);
    return { ok: true };
  });

  ipcMain.handle('portal-content:get-settings', () => {
    try {
      const row = database.getDb()
        .prepare("SELECT value FROM nexus_sys WHERE key='portal_content_settings'")
        .get();
      if (row?.value) return { ok: true, data: JSON.parse(row.value) };
      return { ok: true, data: { sections: [], categories: [] } };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('portal-content:save-settings', (_, settings) => {
    try {
      const json = JSON.stringify(settings);
      database.getDb().prepare(`
        INSERT INTO nexus_sys (key, value) VALUES ('portal_content_settings', ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
      `).run(json);
      return { ok: true };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Receipt Upload — accepts JSON body with base64 file (Gold+: portal) ───
  portalApp.post('/portal/api/receipt-upload', async (req, res) => {
    try {
      const { token, studentId, fileDataB64, fileType, session: termSession, term } = req.body;
      const tokenRecord = activeTokens.get(token);
      if (!tokenRecord || Date.now() > tokenRecord.expiry)
        return res.status(401).json({ ok: false, error: 'Session expired. Please log in again.' });
      if (!tokenRecord.students.some(s => s.id === studentId))
        return res.status(403).json({ ok: false, error: 'Unauthorised.' });
      // ~2MB base64 cap (base64 is ~4/3 of binary size)
      const maxB64 = Math.ceil(2 * 1024 * 1024 * 1.4);
      if (!fileDataB64 || fileDataB64.length > maxB64)
        return res.status(413).json({ ok: false, error: 'File exceeds 2 MB limit.' });

      const db       = database.getDb();
      const keyRow   = db.prepare(`SELECT value FROM app_settings WHERE key = 'gemini_api_key'`).get();
      const gemKey   = keyRow?.value || null;
      const tier     = licenseStatus?.tier || 'Gold';

      // PDF text — always extract if applicable (offline, free)
      let pdfRawText = null;
      if (fileType === 'application/pdf') {
        const pr = await receiptAnalysis.extractPdfText(fileDataB64);
        pdfRawText = pr.ok ? pr.text : null;
      }

      // AI extraction — Diamond only
      let aiFields = {};
      let extractedAmount = null;
      if (tier === 'Diamond' && gemKey) {
        const ai = await receiptAnalysis.analyzeReceiptAI(fileDataB64, fileType, gemKey);
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
          const stu = db.prepare(`SELECT parent_name FROM students WHERE id = ?`).get(studentId);
          if (stu?.parent_name && ai.payerName)
            aiFields.name_match_score = receiptAnalysis.fuzzyNameMatch(stu.parent_name, ai.payerName);
          extractedAmount = ai.amount;
        }
      }

      const ins = db.prepare(`
        INSERT INTO payment_receipts
          (student_id, submitted_via, file_data_b64, file_type,
           extracted_amount, extracted_reference, extracted_date, extracted_payer_name,
           extracted_bank, extracted_confidence, name_match_score,
           pdf_raw_text, ai_raw_response, academic_session, term, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const row = ins.run(
        studentId, 'portal', fileDataB64, fileType,
        aiFields.extracted_amount     ?? null, aiFields.extracted_reference  ?? null,
        aiFields.extracted_date       ?? null, aiFields.extracted_payer_name ?? null,
        aiFields.extracted_bank       ?? null, aiFields.extracted_confidence ?? null,
        aiFields.name_match_score     ?? null,
        pdfRawText, aiFields.ai_raw_response ?? null,
        termSession, term, 'pending'
      );

      // Real-time push to hub
      const pending = db.prepare(`SELECT COUNT(*) as c FROM payment_receipts WHERE status='pending'`).get().c;
      const stuName = db.prepare(`SELECT name FROM students WHERE id=?`).get(studentId)?.name || 'A parent';
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('receipt:new', { count: pending, studentName: stuName });

      res.json({ ok: true, receiptId: row.lastInsertRowid, extractedAmount, pdfText: pdfRawText });
    } catch (err) {
      console.error('[Portal] receipt-upload error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Admin IPC: Payment Receipts ────────────────────────────────────────────────
  ipcMain.handle('receipts:get-pending', () => {
    try {
      const db = database.getDb();
      return { ok: true, data: db.prepare(`
        SELECT r.*, s.name AS student_name, s.class_name, s.parent_name AS registered_parent_name
        FROM payment_receipts r
        JOIN students s ON r.student_id = s.id
        WHERE r.status = 'pending'
        ORDER BY r.created_at DESC
      `).all() };
    } catch (e) { return { ok: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('receipts:get-count', () => {
    try {
      const c = database.getDb().prepare(`SELECT COUNT(*) as c FROM payment_receipts WHERE status='pending'`).get().c;
      return { ok: true, count: c };
    } catch { return { ok: false, count: 0 }; }
  });

  ipcMain.handle('receipts:approve', async (event, { receiptId, amount, method, reference, note, term, session }) => {
    try {
      const db      = database.getDb();
      const receipt = db.prepare(`SELECT * FROM payment_receipts WHERE id=?`).get(receiptId);
      if (!receipt) return { ok: false, error: 'Receipt not found' };
      const reviewer = currentAdminSession?.username || 'Admin';

      db.transaction(() => {
        db.prepare(`
          INSERT INTO fee_transactions
            (student_id, academic_session, term, amount, payment_method, reference_number, recorded_by, note)
          VALUES (?,?,?,?,?,?,?,?)
        `).run(receipt.student_id, session, term, amount, method || 'transfer', reference || '', reviewer, note || `Receipt #${receiptId}`);

        const paid = db.prepare(`SELECT COALESCE(SUM(amount),0) AS t FROM fee_transactions WHERE student_id=? AND academic_session=? AND term=?`).get(receipt.student_id, session, term).t;
        const billed = db.prepare(`SELECT total_billed FROM student_fees WHERE student_id=? AND academic_session=? AND term=?`).get(receipt.student_id, session, term)?.total_billed || 0;
        const st = paid >= billed ? 'cleared' : paid > 0 ? 'partial' : 'unpaid';
        db.prepare(`
          INSERT INTO student_fees (student_id, academic_session, term, total_billed, total_paid, status, updated_at)
          VALUES (?,?,?,?,?,?,datetime('now'))
          ON CONFLICT(student_id, academic_session, term) DO UPDATE SET
            total_paid=excluded.total_paid, status=excluded.status, updated_at=excluded.updated_at
        `).run(receipt.student_id, session, term, billed, paid, st);

        db.prepare(`UPDATE payment_receipts SET status='approved', reviewed_by=?, reviewed_at=datetime('now') WHERE id=?`).run(reviewer, receiptId);
      })();

      // Diamond: notify parent
      if ((licenseStatus?.tier || 'Gold') === 'Diamond') {
        const stu = db.prepare(`SELECT name, parent_phone FROM students WHERE id=?`).get(receipt.student_id);
        if (stu?.parent_phone) {
          const fmt = (n) => `₦${Number(n||0).toLocaleString('en-NG')}`;
          const msg = `✅ *Payment Verified — ${stu.name}*\n\nAmount: *${fmt(amount)}*\nReference: ${reference||'—'}\nTerm: ${term}\n\nYour fee record has been updated. Thank you! 🎓\n_Powered by Nexus School OS_`;
          db.prepare(`INSERT INTO pending_pulse_messages (phone,message,type,student_id) VALUES (?,?,'general',?)`).run(stu.parent_phone, msg, receipt.student_id);
        }
      }
      if (currentAdminSession) db.prepare(`INSERT INTO audit_logs (admin_id,action,target,details) VALUES (?,'APPROVE_RECEIPT','payment_receipts',?)`).run(currentAdminSession.id, `Receipt #${receiptId}, ₦${amount}`);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('receipts:reject', (event, { receiptId, reason }) => {
    try {
      const db = database.getDb();
      const receipt = db.prepare(`SELECT * FROM payment_receipts WHERE id=?`).get(receiptId);
      if (!receipt) return { ok: false, error: 'Receipt not found' };
      const reviewer = currentAdminSession?.username || 'Admin';
      db.prepare(`UPDATE payment_receipts SET status='rejected', reviewed_by=?, reviewed_at=datetime('now'), rejection_reason=? WHERE id=?`).run(reviewer, reason||'', receiptId);
      if ((licenseStatus?.tier || 'Gold') === 'Diamond') {
        const stu = db.prepare(`SELECT name, parent_phone FROM students WHERE id=?`).get(receipt.student_id);
        if (stu?.parent_phone) {
          const msg = `⚠️ *Receipt Update — ${stu.name}*\n\nYour submitted receipt could not be verified.\nReason: ${reason || 'Please contact the school office.'}\n\nKindly resubmit a clearer photo or contact the bursar directly.\n_Powered by Nexus School OS_`;
          db.prepare(`INSERT INTO pending_pulse_messages (phone,message,type,student_id) VALUES (?,?,'general',?)`).run(stu.parent_phone, msg, receipt.student_id);
        }
      }
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  // Bind to 0.0.0.0 so the portal is reachable on ALL network interfaces:
  // school router Wi-Fi, phone hotspot, USB tethering — not just loopback.
  // ⚠  On Windows, the first launch may trigger a Firewall prompt — click "Allow".
  portalApp.listen(portalPort, '0.0.0.0', () => {
    console.log(`[Gold Portal] Parent Portal active on all interfaces → port ${portalPort}`);
    startPortalBroadcaster();
  });
  // ── Phase 4: License Enforcement Engine & Security Lock ────────────
  // licenseStatus already initialized at module scope (line 43)

  function getHardwareFingerprint() {
    const cpus = os.cpus();
    const macs = Object.values(os.networkInterfaces())
      .flat()
      .filter(i => i.mac && i.mac !== '00:00:00:00:00:00')
      .map(i => i.mac)
      .sort()
      .join('-');
    return crypto.createHash('sha256').update((cpus[0]?.model || "") + macs).digest('hex');
  }

  const hardwareId = getHardwareFingerprint();
  console.log(`[Security] Derived Motherboard Fingerprint: ${hardwareId.substring(0, 8)}...`);

  ipcMain.handle("get-hardware-id", () => hardwareId);

  // ── Ed25519 public key embedded at build time (matches NEXUS_LICENSE_SIGNING_KEY) ──
  // To rotate: regenerate keypair, update this hex, re-issue all licenses.
  const NEXUS_PUBLIC_KEY_HEX = process.env.NEXUS_LICENSE_PUBLIC_KEY ||
    '3a963a04b3da96bd402eb5d8a4ffd200e8c695f9fa4633c789649fa188db0daa'; // generated 2026-05-19

  // ── Nigerian Secondary School Calendar (offline expiry — must match nexus-api/src/lib/calendar.ts) ──
  const NIGERIAN_CALENDAR = {
    '2024/2025': { T1:{ start:'2024-09-09', end:'2024-12-14' }, T2:{ start:'2025-01-06', end:'2025-04-05' }, T3:{ start:'2025-04-28', end:'2025-07-19' } },
    '2025/2026': { T1:{ start:'2025-09-08', end:'2025-12-13' }, T2:{ start:'2026-01-05', end:'2026-04-04' }, T3:{ start:'2026-04-27', end:'2026-07-18' } },
    '2026/2027': { T1:{ start:'2026-09-07', end:'2026-12-12' }, T2:{ start:'2027-01-04', end:'2027-04-03' }, T3:{ start:'2027-04-26', end:'2027-07-17' } },
  };
  const GRACE_MS = 14 * 24 * 60 * 60 * 1000;

  function getTermWindow(key) {
    const [session, term] = key.split('-');
    return NIGERIAN_CALENDAR[session]?.[term] ?? null;
  }

  /** Returns 'active' | 'grace' | 'expired' — no internet needed */
  function checkCalendarStatus(licensedTerms, nowMs = Date.now()) {
    let latestEnd = 0;
    const windows = licensedTerms.map(getTermWindow).filter(Boolean);
    // Check if now falls within any licensed term
    for (const w of windows) {
      const s = new Date(w.start + 'T00:00:00Z').getTime();
      const e = new Date(w.end   + 'T23:59:59Z').getTime();
      if (nowMs >= s && nowMs <= e) return 'active';
      if (e > latestEnd) latestEnd = e;
    }
    // Check holiday windows between consecutive licensed terms
    const sorted = windows.sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    for (let i = 0; i < sorted.length - 1; i++) {
      const hStart = new Date(sorted[i].end   + 'T23:59:59Z').getTime();
      const hEnd   = new Date(sorted[i+1].start + 'T00:00:00Z').getTime();
      if (nowMs > hStart && nowMs < hEnd) return 'active';
    }
    if (latestEnd === 0) return 'expired';
    if (nowMs <= latestEnd + GRACE_MS) return 'grace';
    return 'expired';
  }

  /** Verify tweetnacl-style Ed25519 token: base64url(payload).base64url(sig) */
  function verifyNexusToken(token) {
    const b64urlDecode = s => Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'),'base64');
    const parts = token.split('.');
    if (parts.length !== 2) throw new Error('Malformed token');
    const payloadBytes = b64urlDecode(parts[0]);
    const sigBytes     = b64urlDecode(parts[1]);
    const pubKey = Buffer.from(NEXUS_PUBLIC_KEY_HEX, 'hex');
    if (pubKey.length !== 32) throw new Error('Public key not configured');
    // Use Node crypto to verify Ed25519 detached signature
    const keyObj = crypto.createPublicKey({ key: pubKey, format: 'raw', type: 'spki' });
    const valid = crypto.verify(null, payloadBytes, keyObj, sigBytes);
    if (!valid) throw new Error('Invalid signature');
    return JSON.parse(payloadBytes.toString('utf8'));
  }

  // Heartbeat cache (Gold/Diamond) — stored in nexus_sys.json
  let heartbeatCache = { valid_until: 0, term_status: 'active' };

  try {
    const userDataPath = app.getPath('userData');
    const licensePath  = path.join(userDataPath, 'license.nexus');
    const sysConfPath  = path.join(userDataPath, 'nexus_sys.json');

    // Developer Override
    if (process.env.DEV_MODE === 'true') {
      console.log('[Security] DEV_MODE active. Bypassing all license checks.');
      licenseStatus = { locked: false, message: 'DEV_MODE_ACTIVE', student_count: 999999, tier: process.env.DEV_MOCK_TIER || 'Diamond' };
      setSchoolLicense({ payload: JSON.stringify(licenseStatus) });
    } else {
      // 1. Anti-rollback guard
      let lastRunTs = 0;
      let sysConf   = {};
      if (fs.existsSync(sysConfPath)) {
        try { sysConf = JSON.parse(fs.readFileSync(sysConfPath, 'utf-8')); } catch {}
        lastRunTs            = sysConf.last_run_timestamp || 0;
        heartbeatCache       = sysConf.heartbeat_cache   || heartbeatCache;
      }
      if (Date.now() < (lastRunTs - 60_000)) {
        licenseStatus = { locked: true, message: 'System clock tampering detected. Contact your administrator.' };
      } else {
        sysConf.last_run_timestamp = Date.now();
        fs.writeFileSync(sysConfPath, JSON.stringify(sysConf));
      }

      // 2. License file check
      if (!licenseStatus.locked) {
        if (!fs.existsSync(licensePath)) {
          licenseStatus = { locked: true, message: 'NO_LICENSE', reason: 'no_license' };
        } else {
          try {
            const token   = fs.readFileSync(licensePath, 'utf-8').trim();
            const payload = verifyNexusToken(token);

            // 3. Hardware binding check
            if (payload.hardware_id && payload.hardware_id !== hardwareId) {
              licenseStatus = { locked: true, message: 'License is bound to a different device. Contact support.', reason: 'hardware_mismatch' };

            // 4. Provisional (not yet hardware-bound) — allow but prompt
            } else if (!payload.hardware_id) {
              licenseStatus = {
                locked: false, message: 'PROVISIONAL', tier: payload.tier,
                student_count: payload.student_cap, licensed_terms: payload.licensed_terms,
                needs_activation: true,
              };
              setSchoolLicense({ payload: JSON.stringify(payload) });

            } else {
              // 5. Calendar-based expiry (offline — Silver always uses this)
              const calStatus = checkCalendarStatus(payload.licensed_terms || []);

              // 6. For Gold/Diamond: also check heartbeat cache (server-authoritative clock)
              let effectiveStatus = calStatus;
              const tier = (payload.tier || 'Silver').toLowerCase();
              if ((tier === 'gold' || tier === 'diamond') && heartbeatCache.valid_until > Date.now()) {
                effectiveStatus = heartbeatCache.term_status;
              }

              if (effectiveStatus === 'expired') {
                licenseStatus = {
                  locked: true,
                  message: 'License expired. Please renew to continue.',
                  reason: 'expired',
                  tier: payload.tier,
                };
              } else {
                const isGrace = effectiveStatus === 'grace';
                licenseStatus = {
                  locked:        false,
                  message:       isGrace ? 'GRACE' : 'VALID',
                  tier:          payload.tier,
                  student_count: payload.student_cap,
                  licensed_terms: payload.licensed_terms,
                  in_grace:      isGrace,
                  needs_activation: false,
                };
                setSchoolLicense({ payload: JSON.stringify(payload) });
                console.log(`[License] ✅ ${payload.tier} (${effectiveStatus}) — ${payload.student_cap} students`);

                // 7. Schedule heartbeat for Gold/Diamond (non-blocking)
                if (tier === 'gold' || tier === 'diamond') {
                  _scheduleHeartbeat(token, hardwareId, payload.school_id, sysConfPath);
                }
              }
            }
          } catch (verifyErr) {
            console.error('[License] Verification error:', verifyErr.message);
            licenseStatus = { locked: true, message: 'License file is corrupted or tampered.', reason: 'tampered' };
          }
        }
      }
    }
  } catch (e) {
    console.error('[License Engine] Failure:', e);
    licenseStatus = { locked: true, message: 'License vault corrupted. Re-install required.', reason: 'internal_error' };
  }

  // ── Heartbeat helper (Gold/Diamond — sends weekly ping to nexus-api) ─────────
  function _scheduleHeartbeat(token, hwId, schoolId, sysConfPath) {
    const API_BASE = process.env.NEXUS_API_URL || 'https://api.nexusos.com.ng';
    async function doHeartbeat() {
      try {
        const res = await fetch(`${API_BASE}/api/license/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, hardware_id: hwId, school_id: schoolId }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return;
        const data = await res.json();
        // Cache the heartbeat result
        let sysConf = {};
        if (fs.existsSync(sysConfPath)) { try { sysConf = JSON.parse(fs.readFileSync(sysConfPath,'utf-8')); } catch {} }
        sysConf.heartbeat_cache = { valid_until: data.heartbeat_valid_until || 0, term_status: data.term_status || 'active' };
        fs.writeFileSync(sysConfPath, JSON.stringify(sysConf));
        // If server says expired/revoked, show banner but don't hard-lock mid-session
        if (!data.valid && mainWindow) {
          mainWindow.webContents.send('license-status', { ...licenseStatus, server_revoked: true });
        }
      } catch { /* offline — use cached heartbeat */ }
    }
    // First check: 2 minutes after boot (not blocking)
    setTimeout(doHeartbeat, 2 * 60 * 1000);
    // Weekly refresh
    setInterval(doHeartbeat, 7 * 24 * 60 * 60 * 1000);
  }

  // ── Import license file (used by lock screen + About page) ───────────────────
  ipcMain.handle('license:import', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      title:       'Select your license.nexus file',
      buttonLabel: 'Import License',
      filters:     [{ name: 'Nexus License', extensions: ['nexus'] }],
      properties:  ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, reason: 'cancelled' };
    try {
      const src = result.filePaths[0];
      const userDataPath = app.getPath('userData');
      const dest = path.join(userDataPath, 'license.nexus');
      fs.copyFileSync(src, dest);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  });

  // ── Activate online — opens browser with hardware ID pre-filled ───────────────
  ipcMain.handle('license:activate-online', () => {
    const { shell } = require('electron');
    const portalBase = process.env.NEXUSOS_PORTAL_URL || 'https://nexusos.com.ng/portal';
    shell.openExternal(`${portalBase}/activate?hwid=${encodeURIComponent(hardwareId)}`);
    return { ok: true };
  });



  // ── Start Google Drive periodic sync NOW that the license tier is known ─────
  // Previously this ran inside a .then() microtask that fired BEFORE the
  // synchronous license-loading block above, so licenseStatus.tier was always
  // undefined and startPeriodicSync() was never called for production Diamond installs.
  if (pulseExporter.oAuth2Client && licenseStatus?.tier === 'Diamond') {
      console.log('[Pulse] Diamond tier confirmed — starting periodic Drive sync.');
      pulseExporter.startPeriodicSync();
  }

  // Build QR Payload
  qrPayload = {
    sid: "PREMIUM_ACADEMY_001",
    ip: address.ip(),
    port: port,
    handshake_key: "TEMP_RSA_PUBLIC_KEY_STRING",
    config: identityPacket,
  };

  setSchoolConfig(qrPayload.config);

  // Handle Handshake Events
  serverInstance.on("handshake-success", (data) => {
    if (mainWindow) {
      mainWindow.webContents.send("handshake-complete", data);
      console.log(`[Electron] Handshake successful for ${data.teacher_name}`);
    }
  });

  // Handle Sync Events
  serverInstance.on("sync-events", (data) => {
    if (mainWindow) {
      mainWindow.webContents.send("sync-update", data);
      console.log(`[Electron] Forwarded sync events to UI.`);
    }
  });

  // Fallback: also send on did-finish-load
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("qr-payload", qrPayload);
    mainWindow.webContents.send("license-status", licenseStatus);
  });

  ipcMain.on("ui-ready", () => {
    mainWindow.webContents.send("qr-payload", qrPayload);
    mainWindow.webContents.send("license-status", licenseStatus);
    console.log("[Electron] Payload sent to UI");
  });

  ipcMain.on("process-csv", (event, filePath) => {
    handleCSVUpload(filePath, (count) => {
      event.reply("csv-loaded", count);
    });
  });

  console.log(
    "QR Payload:",
    JSON.stringify(
      {
        ...qrPayload,
        config: {
          ...qrPayload.config,
          logoBase64: qrPayload.config.logoBase64 ? "BASE64_Omitted" : null,
        },
      },
      null,
      2,
    ),
  );

  // ── Guardian Shield: Automated Governance Service ────────────────────────
  function startGovernanceService() {
    console.log("[Guardian Shield] Service Active. Monitoring school governance metrics...");
    
    const CHECK_INTERVAL = 15 * 60 * 1000; // 15 Minutes
    
    setInterval(async () => {
      const now = new Date();
      const hour = now.getHours();
      const day = now.getDay(); // 0=Sun, 5=Fri
      const dateStr = now.toISOString().split('T')[0];

      if (licenseStatus?.tier !== 'Gold' && licenseStatus?.tier !== 'Diamond') return;

      const db = database.getDb();

      // 1. Principal's Morning Briefing (9:00 AM)
      if (hour === 9 && identityPacket.principalPhone) {
        const lastBriefing = db.prepare("SELECT value FROM app_settings WHERE key='last_briefing_date'").get()?.value;
        if (lastBriefing !== dateStr) {
          try {
            console.log("[Guardian Shield] Compiling Morning Briefing...");
            const studentCount = db.prepare("SELECT COUNT(*) as c FROM students").get().c;
            const attendance = db.prepare("SELECT COUNT(*) as c FROM daily_attendance WHERE date = ? AND status='Present'").get(dateStr).c;
            
            const stats = {
                studentCount,
                attendance,
                absenceRate: studentCount > 0 ? (((studentCount - attendance) / studentCount) * 100).toFixed(1) : 0
            };
            
            await pulseBot.sendMorningBriefing(identityPacket.principalPhone, identityPacket.name || "Nexus School", stats);
            
            db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_briefing_date', ?)").run(dateStr);
          } catch(e) { console.error("[Guardian Shield] Briefing Failed:", e); }
        }
      }

      // 2. Weekly Academic Pulse (Friday 4:00 PM)
      if (day === 5 && hour === 16) {
        const lastPulse = db.prepare("SELECT value FROM app_settings WHERE key='last_academic_pulse_date'").get()?.value;
        const weekStr = `${now.getFullYear()}-W${Math.ceil(now.getDate() / 7)}`;
        if (lastPulse !== weekStr) {
           console.log("[Guardian Shield] Dispatched Weekly Academic Pulse.");
           // This would typically iterate parents. For now, we log the intent.
           db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_academic_pulse_date', ?)").run(weekStr);
        }
      }
    }, CHECK_INTERVAL);
  }

  startGovernanceService();

  // On-Demand Fee Reminders
  ipcMain.on("trigger-fee-reminders", async () => {
    try {
        const db = database.getDb();
        const termConfig = db.prepare("SELECT * FROM school_term_config WHERE id = 1").get();
        const debtors = db.prepare(`
            SELECT s.name, s.parent_phone, f.total_billed, f.total_paid 
            FROM students s
            JOIN student_fees f ON s.id = f.student_id
            WHERE f.academic_session = ? AND f.term = ? AND (f.total_billed - f.total_paid) > 0
        `).all(termConfig.academic_session, termConfig.term);

        console.log(`[Guardian Shield] Triggering Fee Reminders for ${debtors.length} parents...`);
        
        for (const debtor of debtors) {
            if (debtor.parent_phone) {
                const balance = debtor.total_billed - debtor.total_paid;
                await pulseBot.sendFeeReminder(debtor.parent_phone, debtor.name, identityPacket.name || "Nexus School", balance);
                // Simple rate limiting: 2s delay
                await new Promise(r => setTimeout(r, 2000));
            }
        }
        
        if (mainWindow) {
            mainWindow.webContents.send("fee-reminders-sent", { count: debtors.length });
        }
    } catch (err) {
        console.error("[Guardian Shield] Fee Pulse Failed:", err);
    }
  });
}

if (app) {
  app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("will-quit", () => {
    // Release all keyboard shortcuts so they don't linger in other apps
    globalShortcut.unregisterAll();
    // Release mDNS/Bonjour service so macOS doesn't increment the hostname
    try { bonjour.unpublishAll(() => bonjour.destroy()); } catch(_) {}
  });
} else {
  console.warn(
    "[Nexus] Running in non-electron environment. UI will not be launched.",
  );
}
