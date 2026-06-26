console.log("\n\n*******************************************");
console.log("*       NEXUS DEMO HUB - VERSION 2.3      *");
console.log("*******************************************\n");

const { app, BrowserWindow, ipcMain, shell, Menu, dialog, nativeImage, clipboard, globalShortcut, powerSaveBlocker } = require("electron");

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const dgram = require("dgram");
const Handlebars = require("handlebars");
const { database, server, reports } = require("@nexus/engine");
const scholar = require("@nexus/engine/src/scholar");
const { startServer, setSchoolConfig, setSchoolLicense, revokeDevice, logActivity,
        handleCSVUpload, handleGradesCSVUpload, handleAttendanceCSVUpload, handleClassesCSVUpload,
        handleFeeStructureCSVUpload, handleFeePaymentCSVUpload, handleFeeAdjustmentCSVUpload,
        clearData } = server;
const address = require("address");
const pulseBot     = require('./pulse-bot.js');
const pulseExporter = require('./pulse-exporter.js');
const receiptAnalysis = require('./receipt-analysis.js');
const express = require('express');
const { Bonjour } = require('bonjour-service');
const bonjour = new Bonjour();
const feeCalculator = require("./src/lib/fee-calculator");

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
pulseExporter.getLicenseTier = () => licenseStatus?.tier || "Silver";

// Synchronous getter — renderer calls this at boot to pre-populate tier
// before the reactive `license-status` push event arrives.
ipcMain.handle('license:get-status', () => licenseStatus);

const originalHandle = ipcMain.handle;
function guardStandalone(handler) {
    return (event, ...args) => {
        if (licenseStatus?.tier === 'Standalone') {
            return { ok: false, error: 'Feature locked. Migrate to a payment plan to enjoy the full features of Nexus School OS.' };
        }
        return handler(event, ...args);
    };
}
ipcMain.handle = function(channel, listener) {
    const gatedChannels = [
        'pulse:', 'scholar:', 'cbt:', 'portal:', 'portal-content:', 'fee-structure:', 'attendance:', 'queue:', 'pulse-inbox:',
        'get-daily-attendance', 'save-daily-attendance', 'get-student-attendance-report', 'save-attendance', 'get-attendance'
    ];
    const shouldGate = gatedChannels.some(prefix => channel.startsWith(prefix)) &&
                       channel !== 'cbt:get-system-settings' &&
                       channel !== 'cbt:save-system-setting';
    if (shouldGate) {
        return originalHandle.call(ipcMain, channel, guardStandalone(listener));
    }
    return originalHandle.call(ipcMain, channel, listener);
};

ipcMain.handle('read-guide-file', async (event, filename) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const cleanFilename = path.basename(filename);
        const guidePath = path.join(__dirname, '..', '..', 'private_engine', 'docs', 'guides', cleanFilename);
        if (fs.existsSync(guidePath)) {
            return fs.readFileSync(guidePath, 'utf-8');
        }
    } catch (err) {
        console.error("Failed to read guide file:", err);
    }
    return null;
});

// ── ALL ipcMain.handle registrations (ONCE at module scope) ──────────────────

ipcMain.on("pulse:start", () => {
    if (licenseStatus?.tier === 'Gold' || licenseStatus?.tier === 'Diamond') {
        pulseBot.startPulse();
    } else {
        console.warn("[Pulse] Attempted start on non-eligible tier:", licenseStatus?.tier);
    }
});
ipcMain.on("pulse:stop", () => pulseBot.destroyPulse());
ipcMain.on("pulse:set-autostart", (event, enabled) => {
    try {
        const db = database.getDb();
        db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pulse_autostart', ?)")
          .run(enabled ? 'true' : 'false');
        console.log(`[Pulse] Auto-start configuration updated to: ${enabled}`);
    } catch (err) {
        console.error("[Pulse] Failed to save auto-start configuration:", err);
    }
});
ipcMain.handle("pulse:status", () => pulseBot.getPulseStatus());

  ipcMain.handle("database:backup", async () => {
    try {
      const db = database.getDb();
      const fs = require('fs');
      const path = require('path');
      const backupDir = path.join(path.dirname(db.name), 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `nexus_backup_${timestamp}.sqlite`);
      await db.backup(backupPath);
      console.log(`[Backup] Safe database backup created at: ${backupPath}`);
      logActivity({ event_type: 'BACKUP_CREATED', payload: { path: backupPath } });
      return { ok: true, path: backupPath };
    } catch (e) {
      console.error('[Backup] Database backup failed:', e.message);
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("database:restore", async () => {
    try {
      const db = database.getDb();
      const dbPath = db.name;
      const { dialog } = require('electron');
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select a Backup Database File (.sqlite)',
        buttonLabel: 'Restore Database',
        filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths[0]) {
        return { ok: false, reason: 'cancelled' };
      }
      const src = result.filePaths[0];

      // Close the DB connection before overwriting the file
      db.close();

      // Copy backup file over the active DB file
      fs.copyFileSync(src, dbPath);

      // Write a restore-pending flag so the next launch can distinguish
      // a restore-relaunch from a normal app start (user-triggered only)
      const flagPath = path.join(app.getPath('userData'), '.nexus_restore_pending');
      fs.writeFileSync(flagPath, new Date().toISOString(), 'utf8');
      logActivity({ event_type: 'BACKUP_RESTORED', payload: { source: src } });

      // Relaunch to load the restored database state
      app.relaunch();
      app.exit(0);
      return { ok: true };
    } catch (e) {
      console.error('[Restore] Database restore failed:', e.message);
      return { ok: false, error: e.message };
    }
  });

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
}, () => licenseStatus?.tier || "Silver");

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
        try {
            const db = database.getDb();
            db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'LOGOUT', 'SYSTEM', 'Session terminated')").run(currentAdminSession.id);
        } catch (err) {
            console.error("[Auth] Failed to write logout audit log:", err.message);
        }
    }
    currentAdminSession = null;
    console.log(`[Auth] Session closed.`);
    return { ok: true };
});

const pendingOTPs = {};

ipcMain.handle('auth:forgot-password', async (event, { adminId }) => {
    const db = database.getDb();
    const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(adminId);
    if (!admin) return { ok: false, error: 'Admin not found' };

    const tier = licenseStatus?.tier || 'Silver';
    const isOfflineTier = (tier === 'Standalone' || tier === 'Silver');

    if (isOfflineTier) {
        if (!admin.recovery_question) {
            return { ok: false, error: 'No recovery question configured for this admin.' };
        }
        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'OTP_REQUESTED', 'SYSTEM', 'Recovery requested via SQA (Offline Tier)')").run(adminId);
        return { ok: true, method: 'sqa', question: admin.recovery_question };
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    pendingOTPs[adminId] = { otp, expiresAt: Date.now() + 10 * 60000 }; // 10 min expiry

    // Check individual admin's phone first, then global fallback
    const phone = (admin.phone?.trim() || identityPacket?.principalPhone?.trim() || '').trim();

    if (!phone && process.env.DEV_MODE !== 'true') {
        if (admin.recovery_question) {
            db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'OTP_REQUESTED', 'SYSTEM', 'Recovery requested via SQA (No Phone configured)')").run(adminId);
            return { ok: true, method: 'sqa', question: admin.recovery_question };
        }
        return { ok: false, error: 'School contact phone not configured. Please contact settings or set a security question first.' };
    }

    // Auto-bootstrap Pulse if disconnected
    const pulseStatus = pulseBot.getPulseStatus().status;
    if (pulseStatus === 'disconnected') {
        console.log('[Auth] Forgot Password triggered and Pulse disconnected. Starting Pulse...');
        pulseBot.startPulse();
    }

    const message = `*Nexus School OS - Emergency Access*\n\nAdmin: ${admin.username}\nYour OTP is: *${otp}*\n\nThis OTP expires in 10 minutes.`;

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

    const result = { ok: true, method: 'otp' };
    if (process.env.DEV_MODE === 'true') result.devOtp = otp;
    return result;
});


ipcMain.handle('auth:verify-otp-login', (event, { adminId, otp, username }) => {
    const db = database.getDb();
    const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(adminId);
    if (!admin) return { ok: false, error: 'Admin not found' };

    // Verify username to confirm identity
    if (!username || admin.username.trim().toLowerCase() !== username.trim().toLowerCase()) {
        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'RECOVERY_FAILED', 'SYSTEM', 'OTP verification failed: Username mismatch')").run(adminId);
        return { ok: false, error: 'Identity verification failed.' };
    }

    const record = pendingOTPs[adminId];
    if (!record) return { ok: false, error: 'No OTP requested' };
    if (Date.now() > record.expiresAt) {
        delete pendingOTPs[adminId];
        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'RECOVERY_FAILED', 'SYSTEM', 'OTP verification failed: Expired')").run(adminId);
        return { ok: false, error: 'OTP expired' };
    }
    if (record.otp !== otp) {
        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'RECOVERY_FAILED', 'SYSTEM', 'OTP verification failed: Incorrect code')").run(adminId);
        return { ok: false, error: 'Invalid OTP' };
    }

    // Login successful
    delete pendingOTPs[adminId];
    currentAdminSession = { id: admin.id, username: admin.username, role_level: admin.role_level, loginAt: Date.now() };
    console.log(`[Auth] Session opened via OTP: ${admin.username} (Level ${admin.role_level})`);
    
    db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'LOGIN', 'SYSTEM', 'Session initialized via Emergency OTP')").run(admin.id);
    
    return { ok: true, username: admin.username, role_level: admin.role_level };
});

// auth:get-recovery-question
ipcMain.handle('auth:get-recovery-question', (event, { adminId }) => {
    const db = database.getDb();
    const admin = db.prepare('SELECT id, username, recovery_question FROM admin_users WHERE id = ?').get(adminId);
    if (!admin) return { ok: false, error: 'Admin not found' };
    return { ok: true, question: admin.recovery_question };
});

// auth:verify-sqa-login
ipcMain.handle('auth:verify-sqa-login', (event, { adminId, answer, username }) => {
    const db = database.getDb();
    const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(adminId);
    if (!admin) return { ok: false, error: 'Admin not found' };
    if (!admin.recovery_question || !admin.recovery_answer_hash) {
        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'RECOVERY_FAILED', 'SYSTEM', 'Security recovery failed: SQA not configured')").run(adminId);
        return { ok: false, error: 'Security question not set.' };
    }

    // Verify username to confirm identity
    if (admin.username.trim().toLowerCase() !== username.trim().toLowerCase()) {
        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'RECOVERY_FAILED', 'SYSTEM', 'Security recovery failed: Username mismatch')").run(adminId);
        return { ok: false, error: 'Identity verification failed.' };
    }

    const hashedAnswer = Buffer.from(answer.trim().toLowerCase()).toString('base64');
    if (admin.recovery_answer_hash !== hashedAnswer) {
        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'RECOVERY_FAILED', 'SYSTEM', 'Security recovery failed: Incorrect answer')").run(adminId);
        return { ok: false, error: 'Incorrect answer.' };
    }

    // Login successful
    currentAdminSession = { id: admin.id, username: admin.username, role_level: admin.role_level, loginAt: Date.now() };
    console.log(`[Auth] Session opened via SQA: ${admin.username}`);
    db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'RECOVERY_SUCCESS', 'SYSTEM', 'Session initialized via Security Question verification')").run(admin.id);
    return { ok: true, username: admin.username, role_level: admin.role_level };
});

// auth:update-profile-security
ipcMain.handle('auth:update-profile-security', (event, { adminId, phone, question, answer }) => {
    try {
        const db = database.getDb();
        const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(adminId);
        if (!admin) return { ok: false, error: 'Admin not found' };

        // Permission check: self or super admin
        if (!currentAdminSession || (currentAdminSession.id !== adminId && currentAdminSession.role_level < 9)) {
            return { ok: false, error: 'Permission denied.' };
        }

        let query = 'UPDATE admin_users SET phone = ?';
        const params = [phone ? phone.trim() : null];

        if (question && question.trim()) {
            query += ', recovery_question = ?';
            params.push(question.trim());
        }
        if (answer && answer.trim()) {
            query += ', recovery_answer_hash = ?';
            params.push(Buffer.from(answer.trim().toLowerCase()).toString('base64'));
        }

        query += ' WHERE id = ?';
        params.push(adminId);

        db.prepare(query).run(...params);

        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'PROFILE_SECURITY_UPDATED', 'admin_users', ?)").run(
            currentAdminSession.id,
            `Security settings updated for admin ID ${adminId}`
        );

        return { ok: true };
    } catch (e) {
        console.error('[Auth] update-profile-security error:', e);
        return { ok: false, error: e.message };
    }
});

// auth:get-admin-profile — Retrieve profile details of currently logged-in administrator
ipcMain.handle('auth:get-admin-profile', () => {
    if (!currentAdminSession) return { ok: false, error: 'Unauthorized' };
    try {
        const db = database.getDb();
        const admin = db.prepare('SELECT id, username, role_level, phone, recovery_email, totp_enabled, avatar FROM admin_users WHERE id = ?').get(currentAdminSession.id);
        return { ok: true, profile: admin };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

// auth:update-admin-profile — Update username, phone, recovery email, and avatar (requires Sudo PIN or TOTP)
ipcMain.handle('auth:update-admin-profile', (event, { username, phone, recovery_email, avatar, pin, totpCode }) => {
    if (!currentAdminSession) return { ok: false, error: 'Unauthorized' };
    try {
        const db = database.getDb();
        const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(currentAdminSession.id);
        if (!admin) return { ok: false, error: 'Admin not found' };

        // Verify either sudo PIN or TOTP
        let verified = false;
        if (pin) {
            const pinHash = Buffer.from(String(pin)).toString('base64');
            if (pinHash === admin.secret_hash) {
                verified = true;
            }
        }
        if (!verified && totpCode && admin.totp_secret && admin.totp_enabled === 1) {
            const speakeasy = require('speakeasy');
            verified = speakeasy.totp.verify({
                secret: admin.totp_secret,
                encoding: 'base32',
                token: String(totpCode),
                window: 1
            });
        }

        if (!verified) {
            return { ok: false, error: 'Verification failed. Incorrect PIN or TOTP code.' };
        }

        db.prepare('UPDATE admin_users SET username = ?, phone = ?, recovery_email = ?, avatar = COALESCE(?, avatar) WHERE id = ?')
          .run(username.trim(), phone ? phone.trim() : null, recovery_email ? recovery_email.trim() : '', avatar || null, currentAdminSession.id);

        currentAdminSession.username = username.trim();

        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'UPDATE_PROFILE', 'admin_users', ?)").run(
            currentAdminSession.id,
            `Updated profile for ${username.trim()}`
        );

        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

// auth:setup-totp — Generates secret and QR code URI for 2FA setup
ipcMain.handle('auth:setup-totp', async () => {
    if (!currentAdminSession) return { ok: false, error: 'Unauthorized' };
    try {
        const db = database.getDb();
        const admin = db.prepare('SELECT username FROM admin_users WHERE id = ?').get(currentAdminSession.id);
        if (!admin) return { ok: false, error: 'Admin not found' };

        const speakeasy = require('speakeasy');
        const qrcode = require('qrcode');

        const secret = speakeasy.generateSecret({
            name: `Nexus School OS (${admin.username})`,
            issuer: 'Nexus OS'
        });

        const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);

        db.prepare('UPDATE admin_users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?')
          .run(secret.base32, currentAdminSession.id);

        return {
            ok: true,
            secret: secret.base32,
            qrCodeUrl: qrDataUrl
        };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

// auth:verify-totp — Verifies the code and enables 2FA
ipcMain.handle('auth:verify-totp', (event, { code }) => {
    if (!currentAdminSession) return { ok: false, error: 'Unauthorized' };
    try {
        const db = database.getDb();
        const admin = db.prepare('SELECT totp_secret FROM admin_users WHERE id = ?').get(currentAdminSession.id);
        if (!admin || !admin.totp_secret) return { ok: false, error: 'TOTP setup not initialized' };

        const speakeasy = require('speakeasy');
        const verified = speakeasy.totp.verify({
            secret: admin.totp_secret,
            encoding: 'base32',
            token: String(code),
            window: 1
        });

        if (verified) {
            db.prepare('UPDATE admin_users SET totp_enabled = 1 WHERE id = ?').run(currentAdminSession.id);
            db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'ENABLE_2FA', 'admin_users', 'TOTP 2FA enabled')").run(currentAdminSession.id);
            return { ok: true };
        } else {
            return { ok: false, error: 'Invalid verification code' };
        }
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

// auth:disable-totp — Disables 2FA (requires PIN or TOTP code)
ipcMain.handle('auth:disable-totp', (event, { pin, totpCode }) => {
    if (!currentAdminSession) return { ok: false, error: 'Unauthorized' };
    try {
        const db = database.getDb();
        const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(currentAdminSession.id);
        if (!admin) return { ok: false, error: 'Admin not found' };

        let verified = false;
        if (pin) {
            const pinHash = Buffer.from(String(pin)).toString('base64');
            if (pinHash === admin.secret_hash) verified = true;
        }
        if (!verified && totpCode && admin.totp_secret && admin.totp_enabled === 1) {
            const speakeasy = require('speakeasy');
            verified = speakeasy.totp.verify({
                secret: admin.totp_secret,
                encoding: 'base32',
                token: String(totpCode),
                window: 1
            });
        }

        if (!verified) {
            return { ok: false, error: 'Verification failed. Incorrect PIN or TOTP code.' };
        }

        db.prepare('UPDATE admin_users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?').run(currentAdminSession.id);
        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'DISABLE_2FA', 'admin_users', 'TOTP 2FA disabled')").run(currentAdminSession.id);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
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

        let details = 'Admin credentials changed';
        if (currentAdminSession && currentAdminSession.id === adminId) {
            details += ' proactively while logged in';
        } else {
            details += ' via recovery reset';
        }

        db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'PIN_CHANGED', 'SYSTEM', ?)").run(adminId, details);
        console.log(`[Auth] PIN changed for admin ID ${adminId}`);
        return { ok: true };
    } catch (e) {
        console.error('[Auth] change-pin error:', e);
        return { ok: false, error: e.message };
    }
});

// auth:create-admin — Super-admins can add new staff accounts
ipcMain.handle('auth:create-admin', (event, { username, pin, roleLevel, displayName, phone, question, answer }) => {
    try {
        const db = database.getDb();
        if (!username?.trim() || !pin?.trim()) return { ok: false, error: 'Username and PIN are required.' };
        const exists = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username.trim());
        if (exists) return { ok: false, error: `Username "${username.trim()}" is already taken.` };
        if (pin.trim().length < 4) return { ok: false, error: 'PIN must be at least 4 characters.' };
        const hash = Buffer.from(pin.trim()).toString('base64');
        
        const qHash = answer?.trim() ? Buffer.from(answer.trim().toLowerCase()).toString('base64') : null;
        
        const result = db.prepare(`
            INSERT INTO admin_users (username, secret_hash, auth_type, role_level, phone, recovery_question, recovery_answer_hash) 
            VALUES (?, ?, 'pin', ?, ?, ?, ?)
        `).run(
            username.trim(), 
            hash, 
            parseInt(roleLevel) || 1, 
            phone ? phone.trim() : null, 
            question ? question.trim() : null, 
            qHash
        );
        
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
    const targetFile = process.env.USE_REACT_UI === 'true' ? 'dist/renderer.html' : 'index.html';
    mainWindow.loadFile(targetFile);
    console.log(`[Auth] Lock screen dismissed. Loading ${targetFile}.`);
});

ipcMain.on('auth:lock', () => {
    if (!mainWindow) return;
    if (currentAdminSession) {
        try {
            const db = database.getDb();
            db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'LOCK', 'SYSTEM', 'Idle timeout triggered lock')").run(currentAdminSession.id);
        } catch (err) {
            console.error("[Auth] Failed to write lock audit log:", err.message);
        }
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

    const students = db.prepare("SELECT id FROM students WHERE UPPER(replace(class_name || COALESCE(' ' || NULLIF(class_arm, ''), ''), ' ', '')) = ?").all(className.replace(/\s+/g, '').toUpperCase());
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
    const students = db.prepare("SELECT id, name, parent_phone FROM students WHERE UPPER(replace(class_name || COALESCE(' ' || NULLIF(class_arm, ''), ''), ' ', '')) = ?").all(class_name.replace(/\s+/g, '').toUpperCase());
    
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

ipcMain.handle('pulse-inbox:get-messages', () => {
    try {
        const db = database.getDb();
        return db.prepare("SELECT * FROM pulse_inbox ORDER BY received_at DESC").all();
    } catch (e) {
        console.error("[Inbox] Failed to get messages:", e);
        return [];
    }
});

ipcMain.handle('pulse-inbox:mark-read', (event, id) => {
    try {
        const db = database.getDb();
        db.prepare("UPDATE pulse_inbox SET status = 'read' WHERE id = ?").run(id);
        return { ok: true };
    } catch (e) {
        console.error("[Inbox] Failed to mark read:", e);
        return { ok: false, error: e.message };
    }
});

ipcMain.handle('pulse-inbox:reply', async (event, { id, phone, replyText }) => {
    try {
        const db = database.getDb();
        db.prepare("UPDATE pulse_inbox SET status = 'replied' WHERE id = ?").run(id);
        
        // Log manual reply as an outgoing message
        const res = db.prepare(`
            INSERT INTO pulse_inbox (sender_name, sender_phone, content, status, direction)
            VALUES (?, ?, ?, 'read', 'outgoing')
        `).run("School Admin", phone, replyText);

        const newMsgId = res.lastInsertRowid;

        // Queue it for sending
        db.prepare(`
            INSERT INTO pending_pulse_messages (phone, message, type)
            VALUES (?, ?, 'general')
        `).run(phone, replyText);

        // Send back to renderer so it renders in the chat bubble list immediately
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("pulse:new-message", {
                id: newMsgId,
                sender_name: "School Admin",
                sender_phone: phone,
                content: replyText,
                received_at: new Date().toISOString(),
                status: 'read',
                direction: 'outgoing'
            });
        }

        return { ok: true };
    } catch (e) {
        console.error("[Inbox] Failed to reply:", e);
        return { ok: false, error: e.message };
    }
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
    if (licenseStatus?.tier !== 'Diamond') {
        console.warn("[Pulse] Save credentials rejected: Diamond tier required.");
        return;
    }
    const db = database.getDb();
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('google_client_id', ?)").run(clientId);
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('google_client_secret', ?)").run(clientSecret);
    // Await init so oAuth2Client is ready before the auth URL is requested.
    await pulseExporter.init();
    console.log('[Pulse] Google credentials saved and OAuth client re-initialised.');
});

ipcMain.handle("pulse:get-google-auth-url", async () => {
    if (licenseStatus?.tier !== 'Diamond') {
        console.warn("[Pulse] Get Google auth URL rejected: Diamond tier required.");
        return null;
    }
    await pulseExporter.init();
    if (!pulseExporter.oAuth2Client) return null;
    return pulseExporter.oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/drive.file'],
        prompt: 'consent'
    });
});

ipcMain.handle("pulse:get-cloud-status", () => {
    if (licenseStatus?.tier !== 'Diamond') {
        return {
            isConfigured: false,
            isSyncing: false,
            securityKey: null,
            refreshToken: null
        };
    }
    return {
        isConfigured: !!pulseExporter.oAuth2Client,
        isSyncing: pulseExporter.isSyncing,
        securityKey: pulseExporter.getOrCreateSecurityKey(),
        refreshToken: pulseExporter.getRefreshToken()
    };
});

ipcMain.on("pulse:trigger-sync", () => {
    if (licenseStatus?.tier !== 'Diamond') {
        console.warn("[Pulse] Manual sync trigger rejected: Diamond tier required.");
        return;
    }
    pulseExporter.syncToDrive();
});

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
    const classes = db.prepare("SELECT DISTINCT class_name || COALESCE(' ' || NULLIF(class_arm, ''), '') as class_name FROM students WHERE class_name IS NOT NULL AND class_name != '' ORDER BY class_name ASC").all().map(r => r.class_name);
    
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
    const rows = db.prepare("SELECT DISTINCT class_name || COALESCE(' ' || NULLIF(class_arm, ''), '') as class_name FROM students WHERE class_name IS NOT NULL AND class_name != '' ORDER BY class_name ASC").all();
    return rows.map(r => r.class_name);
  } catch (err) {
    console.error("Failed to fetch classes:", err);
    return [];
  }
});

ipcMain.handle("classes:getAll", () => {
  try {
    const db = database.getDb();
    const setting = db.prepare("SELECT value FROM system_settings WHERE key = 'class_hierarchy'").get();
    const hierarchy = setting ? JSON.parse(setting.value) : [];

    const configs = db.prepare("SELECT hierarchy_class, max_subjects, pass_mark_override FROM class_configs").all();
    const arms = db.prepare("SELECT hierarchy_class, arm FROM class_arms ORDER BY arm ASC").all();
    
    const armsMap = {};
    arms.forEach(r => {
      if (!armsMap[r.hierarchy_class]) armsMap[r.hierarchy_class] = [];
      armsMap[r.hierarchy_class].push(r.arm);
    });

    const configsMap = {};
    configs.forEach(c => {
      configsMap[c.hierarchy_class] = c;
    });

    return hierarchy.map(cls => {
      const c = configsMap[cls] || { max_subjects: 0, pass_mark_override: null };
      return {
        hierarchy_class: cls,
        max_subjects: c.max_subjects || 0,
        pass_mark_override: c.pass_mark_override ?? null,
        arms: armsMap[cls] || []
      };
    });
  } catch (err) {
    console.error("Failed to fetch classes:getAll:", err);
    return [];
  }
});

ipcMain.handle("classes:getFullList", () => {
  try {
    const db = database.getDb();

    // One-time idempotent migration: class_arms.arm was sometimes stored with
    // the hierarchy class prefix included (e.g. "JSS 1 Emerald" instead of
    // "Emerald"). This caused getFullList to produce doubled names like
    // "JSS 1 JSS 1 Emerald". Two-step fix:
    // Step 1 — delete prefixed arms where the normalised form already exists
    //           (avoids UNIQUE constraint violations on step 2).
    db.prepare(`
      DELETE FROM class_arms
      WHERE arm LIKE hierarchy_class || ' %'
        AND EXISTS (
          SELECT 1 FROM class_arms ca2
          WHERE ca2.hierarchy_class = class_arms.hierarchy_class
            AND ca2.arm = substr(class_arms.arm, length(class_arms.hierarchy_class) + 2)
        )
    `).run();
    // Step 2 — normalise remaining prefixed arms.
    db.prepare(`
      UPDATE class_arms
      SET arm = substr(arm, length(hierarchy_class) + 2)
      WHERE arm LIKE hierarchy_class || ' %'
    `).run();

    const setting = db.prepare("SELECT value FROM system_settings WHERE key = 'class_hierarchy'").get();
    const hierarchy = setting ? JSON.parse(setting.value) : [];

    const arms = db.prepare("SELECT hierarchy_class, arm FROM class_arms ORDER BY arm ASC").all();
    const armsMap = {};
    arms.forEach(r => {
      if (!armsMap[r.hierarchy_class]) armsMap[r.hierarchy_class] = [];
      armsMap[r.hierarchy_class].push(r.arm);
    });

    const flatList = [];
    hierarchy.forEach(cls => {
      const clsArms = armsMap[cls] || [];
      if (clsArms.length > 0) {
        clsArms.forEach(arm => {
          // Defensive: if the stored arm already contains the full name, use
          // it directly rather than prepending the class name again.
          const fullName = arm.startsWith(`${cls} `) ? arm : `${cls} ${arm}`;
          flatList.push(fullName);
        });
      } else {
        flatList.push(cls);
      }
    });
    return flatList;
  } catch (err) {
    console.error("Failed to fetch classes:getFullList:", err);
    return [];
  }
});

ipcMain.handle("classes:saveConfig", (event, { hierarchyClass, maxSubjects, passMarkOverride }) => {
  try {
    const db = database.getDb();
    db.prepare(`
      INSERT INTO class_configs (hierarchy_class, max_subjects, pass_mark_override)
      VALUES (?, ?, ?)
      ON CONFLICT(hierarchy_class) DO UPDATE SET
        max_subjects = excluded.max_subjects,
        pass_mark_override = excluded.pass_mark_override
    `).run(hierarchyClass, maxSubjects, passMarkOverride);
    return { success: true };
  } catch (err) {
    console.error("Failed to save class config:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("classes:saveArms", (event, { hierarchyClass, arms }) => {
  try {
    const db = database.getDb();
    db.transaction(() => {
      db.prepare("DELETE FROM class_arms WHERE hierarchy_class = ?").run(hierarchyClass);
      if (arms && arms.length > 0) {
        const insertStmt = db.prepare("INSERT INTO class_arms (hierarchy_class, arm) VALUES (?, ?)");
        arms.forEach(arm => {
          if (arm && arm.trim() !== '') {
            insertStmt.run(hierarchyClass, arm.trim());
          }
        });
      }
    })();
    return { success: true };
  } catch (err) {
    console.error("Failed to save class arms:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("classes:addArm", (event, { hierarchyClass, arm }) => {
  try {
    if (!arm || arm.trim() === '') return { success: false, error: "Arm cannot be empty" };
    const db = database.getDb();
    db.prepare("INSERT OR IGNORE INTO class_arms (hierarchy_class, arm) VALUES (?, ?)")
      .run(hierarchyClass, arm.trim());
    return { success: true };
  } catch (err) {
    console.error("Failed to add arm:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("classes:removeArm", (event, { hierarchyClass, arm }) => {
  try {
    const db = database.getDb();
    db.prepare("DELETE FROM class_arms WHERE hierarchy_class = ? AND arm = ?")
      .run(hierarchyClass, arm);
    return { success: true };
  } catch (err) {
    console.error("Failed to remove arm:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("dashboard:getSnapshot", async () => {
  try {
    const db = database.getDb();
    const teachers = db.prepare("SELECT COUNT(*) as c FROM teachers").get().c;
    const students = db.prepare("SELECT COUNT(*) as c FROM students").get().c;
    const classes = db.prepare("SELECT COUNT(*) as c FROM class_arms").get().c;
    
    let devices = 0;
    try {
      if (licenseStatus?.tier === 'Standalone') {
        devices = db.prepare("SELECT COUNT(*) as c FROM connected_devices").get().c;
      } else {
        devices = db.prepare("SELECT COUNT(DISTINCT device_id) as c FROM sync_logs").get().c;
      }
    } catch (_) {}

    let grade_events = 0;
    try { grade_events = db.prepare("SELECT COUNT(*) as c FROM sync_logs").get().c; } catch (_) {}

    let sync_warnings = 0;
    try { sync_warnings = db.prepare("SELECT COUNT(*) as c FROM sync_warnings").get().c; } catch (_) {}

    let fee_alerts = 0;
    try { fee_alerts = db.prepare("SELECT COUNT(*) as c FROM student_fees WHERE status IN ('unpaid', 'partial')").get().c; } catch (_) {}

    return {
      teachers,
      students,
      classes,
      devices,
      grade_events,
      sync_warnings,
      fee_alerts
    };
  } catch (err) {
    console.error("Failed to fetch dashboard:getSnapshot:", err);
    return { teachers: 0, students: 0, classes: 0, devices: 0, grade_events: 0, sync_warnings: 0, fee_alerts: 0 };
  }
});

ipcMain.handle("get-teachers", () => {
  try {
    const db = database.getDb();
    const teachers = db
      .prepare(`
        SELECT t.id, t.name, t.phone, t.email, t.signature,
               (SELECT group_concat(class_name, ', ') FROM form_teachers WHERE teacher_id = t.id) as host_class
        FROM teachers t
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

ipcMain.handle("generateAdminQR", () => {
  if (!qrPayload) return false;
  qrPayload.teacher_id = 'STANDALONE_ADMIN';
  qrPayload.teacher_name = 'Admin';
  if (mainWindow) {
    mainWindow.webContents.send("qr-payload", qrPayload);
    console.log(`[Electron] QR updated for Standalone Admin`);
  }
  return true;
});


// ── Teacher Access Revocation ─────────────────────────────────────────────────
// Lazily adds sync_revoked column if it doesn't exist yet (safe migration).
function ensureSyncRevokedColumn() {
  try {
    const db = database.getDb();
    const cols = db.prepare("PRAGMA table_info(teachers)").all();
    if (!cols.some(c => c.name === 'sync_revoked')) {
      db.prepare("ALTER TABLE teachers ADD COLUMN sync_revoked INTEGER DEFAULT 0").run();
      console.log('[SyncHub] Added sync_revoked column to teachers table');
    }
  } catch (err) {
    console.error('[SyncHub] ensureSyncRevokedColumn error:', err.message);
  }
}

ipcMain.handle("teacher:get-access-list", () => {
  try {
    ensureSyncRevokedColumn();
    const db = database.getDb();
    const rows = db.prepare(
      "SELECT id, name, COALESCE(sync_revoked, 0) AS sync_revoked FROM teachers ORDER BY name ASC"
    ).all();
    return { ok: true, data: rows };
  } catch (err) {
    console.error("[SyncHub] teacher:get-access-list error:", err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("teacher:revoke-access", (event, { teacherId, adminId, pin }) => {
  try {
    ensureSyncRevokedColumn();
    const db = database.getDb();

    // Verify admin PIN first
    const admin = adminId ? db.prepare("SELECT * FROM admin_users WHERE id = ?").get(adminId) : null;
    if (!admin) return { ok: false, error: "Admin not found" };
    const pinHash = Buffer.from(String(pin)).toString("base64");
    if (pinHash !== admin.secret_hash) return { ok: false, error: "Incorrect PIN" };

    // Execute revocation
    db.prepare("UPDATE teachers SET sync_revoked = 1 WHERE id = ?").run(teacherId);

    // Broadcast revoke so the sync server can reject this teacher's heartbeats
    if (mainWindow) mainWindow.webContents.send("teacher-revoke-broadcast", { teacherId });

    // Audit log
    try {
      db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'REVOKE_TEACHER_ACCESS', ?, 'Sync access revoked')")
        .run(admin.id, teacherId);
    } catch (_) {}

    console.log(`[SyncHub] Teacher ${teacherId} sync access revoked by ${admin.username}`);
    return { ok: true };
  } catch (err) {
    console.error("[SyncHub] teacher:revoke-access error:", err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("teacher:restore-access", (event, { teacherId, adminId, pin }) => {
  try {
    ensureSyncRevokedColumn();
    const db = database.getDb();

    const admin = adminId ? db.prepare("SELECT * FROM admin_users WHERE id = ?").get(adminId) : null;
    if (!admin) return { ok: false, error: "Admin not found" };
    const pinHash = Buffer.from(String(pin)).toString("base64");
    if (pinHash !== admin.secret_hash) return { ok: false, error: "Incorrect PIN" };

    db.prepare("UPDATE teachers SET sync_revoked = 0 WHERE id = ?").run(teacherId);
    try {
      db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'RESTORE_TEACHER_ACCESS', ?, 'Sync access restored')")
        .run(admin.id, teacherId);
    } catch (_) {}

    console.log(`[SyncHub] Teacher ${teacherId} sync access restored by ${admin.username}`);
    return { ok: true };
  } catch (err) {
    console.error("[SyncHub] teacher:restore-access error:", err.message);
    return { ok: false, error: err.message };
  }
});

// ── DB Stats (for wizard gate logic) ─────────────────────────────────────────
ipcMain.handle("get-db-stats", () => {
  try {
    const db = database.getDb();
    const teachers = db.prepare("SELECT COUNT(*) as c FROM teachers").get().c;
    const students = db.prepare("SELECT COUNT(*) as c FROM students").get().c;
    const classes = db.prepare("SELECT COUNT(*) as c FROM class_arms").get().c;
    let devices = 0;
    try {
      if (licenseStatus?.tier === 'Standalone') {
        devices = db.prepare("SELECT COUNT(*) as c FROM connected_devices").get().c;
      } else {
        devices = db.prepare("SELECT COUNT(DISTINCT device_id) as c FROM sync_logs").get().c;
      }
    } catch (_) {}
    let grade_events = 0;
    try {
      grade_events = db.prepare("SELECT COUNT(*) as c FROM sync_logs").get().c;
    } catch (_) {}
    return { teachers, students, classes, devices, grade_events };
  } catch (err) {
    return { teachers: 0, students: 0, classes: 0, devices: 0, grade_events: 0 };
  }
});

// ── Standalone Device Management ──────────────────────────────────────────────
ipcMain.handle("standalone:get-devices", () => {
  try {
    const db = database.getDb();
    const rows = db.prepare("SELECT device_id as id, device_model as name, label, paired_at FROM connected_devices").all();
    return { ok: true, data: rows.map(r => ({ id: r.id, name: `${r.name || 'Unknown Device'} (${r.id.substring(0, 8)})`, sync_revoked: 0 })) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("standalone:revoke-device", (event, { teacherId }) => {
  try {
    const db = database.getDb();
    db.prepare("DELETE FROM connected_devices WHERE device_id = ?").run(teacherId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Form-based Teacher Entry ──────────────────────────────────────────────────
function normalizeSubjectName(subject, className) {
  if (!subject) return "";
  let norm = subject.trim();
  if (norm === "Further Maths" || norm === "Further Mathematic") {
    return "Further Mathematics";
  }
  if (norm === "Literature") {
    return "Literature in English";
  }
  if (!className) return norm;
  const isJSS = className.toUpperCase().startsWith("JS") || className.toUpperCase().startsWith("JSS");
  const isSSS = className.toUpperCase().startsWith("SS");
  if (norm === "General Mathematics" && isJSS) {
    return "Mathematics";
  }
  if (norm === "Mathematics" && isSSS) {
    return "General Mathematics";
  }
  return norm;
}

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
                insertAlloc.run(id, class_name, normalizeSubjectName(subject, class_name));
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
            if (subj.trim()) ins.run(id, class_name, normalizeSubjectName(subj, class_name));
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
ipcMain.handle("add-student-form", (event, { id, name, class_name, class_arm, subjects, reg_no, admission_no, gender, dob, photo, parent_email, parent_phone, parent_name, fee_status }) => {
  try {
    const db = database.getDb();
    db.transaction(() => {
      db.prepare(`
        INSERT INTO students (id, name, class_name, class_arm, reg_no, admission_no, gender, dob, photo, parent_email, parent_phone, parent_name, fee_status)
        VALUES (@id, @name, @class_name, @class_arm, @reg_no, @admission_no, @gender, @dob, @photo, @parent_email, @parent_phone, @parent_name, @fee_status)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, class_name=excluded.class_name, class_arm=excluded.class_arm,
          reg_no=excluded.reg_no, admission_no=excluded.admission_no, gender=excluded.gender, dob=excluded.dob,
          photo=COALESCE(excluded.photo, photo),
          parent_email=excluded.parent_email, parent_phone=excluded.parent_phone,
          parent_name=excluded.parent_name,
          fee_status=excluded.fee_status
      `).run({ id, name, class_name, class_arm: class_arm || '',
        reg_no: reg_no || '', admission_no: admission_no || '', gender: gender || '', dob: dob || '',
        photo: photo || null, parent_email: parent_email || '',
        parent_phone: parent_phone || '', parent_name: parent_name || null,
        fee_status: fee_status || 'cleared'
      });
      db.prepare("DELETE FROM student_subjects WHERE student_id = ?").run(id);
      if (subjects && subjects.length > 0) {
        const stmt = db.prepare("INSERT INTO student_subjects (student_id, subject) VALUES (?, ?)");
        for (const subj of subjects) stmt.run(id, normalizeSubjectName(subj, class_name));
      }
    })();
    console.log(`[Form] Student added: ${name} with ${subjects?.length || 0} subjects`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Form-based Student Update (“Edit” path) ──────────────────────────────────────
ipcMain.handle("update-student", (event, { id, name, class_name, class_arm, subjects, reg_no, admission_no, gender, dob, photo, parent_email, parent_phone, parent_name, fee_status }) => {
  try {
    const db = database.getDb();
    db.transaction(() => {
      if (photo !== undefined) {
        db.prepare(`
          UPDATE students SET name=@name, class_name=@class_name, class_arm=@class_arm,
            reg_no=@reg_no, admission_no=@admission_no, gender=@gender, dob=@dob, photo=@photo,
            parent_email=@parent_email, parent_phone=@parent_phone, parent_name=@parent_name,
            fee_status=@fee_status
          WHERE id=@id
        `).run({ id, name, class_name, class_arm: class_arm || '', reg_no: reg_no||'', admission_no: admission_no||'', gender: gender||'', dob: dob||'',
                 photo, parent_email: parent_email||'', parent_phone: parent_phone||'',
                 parent_name: parent_name||null, fee_status: fee_status||'cleared' });
      } else {
        db.prepare(`
          UPDATE students SET name=@name, class_name=@class_name, class_arm=@class_arm,
            reg_no=@reg_no, admission_no=@admission_no, gender=@gender, dob=@dob,
            parent_email=@parent_email, parent_phone=@parent_phone, parent_name=@parent_name,
            fee_status=@fee_status
          WHERE id=@id
        `).run({ id, name, class_name, class_arm: class_arm || '', reg_no: reg_no||'', admission_no: admission_no||'', gender: gender||'', dob: dob||'',
                 parent_email: parent_email||'', parent_phone: parent_phone||'',
                 parent_name: parent_name||null, fee_status: fee_status||'cleared' });
      }
      // Replace subject enrollment
      db.prepare("DELETE FROM student_subjects WHERE student_id = ?").run(id);
      if (subjects && subjects.length > 0) {
        const stmt = db.prepare("INSERT INTO student_subjects (student_id, subject) VALUES (?, ?)");
        for (const subj of subjects) stmt.run(id, normalizeSubjectName(subj, class_name));
      }
    })();
    console.log(`[Form] Student ${id} updated: ${name}, ${subjects?.length || 0} subjects.`);
    return { ok: true };
  } catch (err) {
    console.error('[Form] update-student failed:', err);
    return { ok: false, error: err.message };
  }
});

// ── Student Directory Settings (mobile registration, grade, attendance locks) ─────────────
ipcMain.handle('students:get-settings', () => {
  try {
    const db = database.getDb();
    const regRow = db.prepare("SELECT value FROM app_settings WHERE key = 'mobile_registration_locked'").get();
    const gradesRow = db.prepare("SELECT value FROM app_settings WHERE key = 'mobile_grades_locked'").get();
    const attRow = db.prepare("SELECT value FROM app_settings WHERE key = 'mobile_attendance_locked'").get();
    const regLockAtRow = db.prepare("SELECT value FROM app_settings WHERE key = 'mobile_registration_lock_at'").get();
    const gradesLockAtRow = db.prepare("SELECT value FROM app_settings WHERE key = 'mobile_grades_lock_at'").get();
    const attLockAtRow = db.prepare("SELECT value FROM app_settings WHERE key = 'mobile_attendance_lock_at'").get();

    return {
      ok: true,
      mobile_registration_locked: regRow ? regRow.value === '1' : false,
      mobile_grades_locked: gradesRow ? gradesRow.value === '1' : false,
      mobile_attendance_locked: attRow ? attRow.value === '1' : false,
      mobile_registration_lock_at: regLockAtRow ? regLockAtRow.value : null,
      mobile_grades_lock_at: gradesLockAtRow ? gradesLockAtRow.value : null,
      mobile_attendance_lock_at: attLockAtRow ? attLockAtRow.value : null
    };
  } catch (err) {
    console.error('[Students] get-settings error:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('students:save-settings', (_, data) => {
  try {
    const db = database.getDb();
    const {
      mobile_registration_locked,
      mobile_grades_locked,
      mobile_attendance_locked,
      mobile_registration_lock_at,
      mobile_grades_lock_at,
      mobile_attendance_lock_at
    } = data;

    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('mobile_registration_locked', ?)")
      .run(mobile_registration_locked ? '1' : '0');
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('mobile_grades_locked', ?)")
      .run(mobile_grades_locked ? '1' : '0');
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('mobile_attendance_locked', ?)")
      .run(mobile_attendance_locked ? '1' : '0');
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('mobile_registration_lock_at', ?)")
      .run(mobile_registration_lock_at || null);
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('mobile_grades_lock_at', ?)")
      .run(mobile_grades_lock_at || null);
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('mobile_attendance_lock_at', ?)")
      .run(mobile_attendance_lock_at || null);

    return { ok: true };
  } catch (err) {
    console.error('[Students] save-settings error:', err);
    return { ok: false, error: err.message };
  }
});

// ── Directory: Get All Teachers (with allocations) ──────────────────────────
ipcMain.handle("get-all-teachers", (event, { limit = 15, offset = 0, search = "", minimal = false } = {}) => {
  try {
    const db = database.getDb();
    const query = search ? `%${search}%` : "%";
    
    const total = db.prepare("SELECT COUNT(*) as total FROM teachers WHERE name LIKE ? OR id LIKE ?").get(query, query).total;

    const teachers = db.prepare(`
      SELECT t.*, (SELECT group_concat(class_name, ', ') FROM form_teachers WHERE teacher_id = t.id) as host_class
      FROM teachers t
      WHERE t.name LIKE ? OR t.id LIKE ? 
      ORDER BY t.name ASC 
      LIMIT ? OFFSET ?
    `).all(query, query, limit, offset);

    if (!minimal) {
      const getAllocs = db.prepare(
        "SELECT class_name, subject FROM teacher_allocations WHERE teacher_id = ? ORDER BY class_name, subject",
      );
      for (const t of teachers) {
        t.allocations = getAllocs.all(t.id);
      }
    } else {
      for (const t of teachers) {
        t.allocations = [];
      }
    }
    return { ok: true, data: teachers, total };
  } catch (err) {
    console.error("[Dir] Failed to get teachers:", err);
    return { ok: false, error: err.message, data: [], total: 0 };
  }
});

// ── Directory: Get All Students ─────────────────────────────────────────
ipcMain.handle("get-all-students", (event, { limit = 15, offset = 0, search = "", class_name = "", subject = "", teacher_id = "", no_arm = false, minimal = false } = {}) => {
  try {
    const db = database.getDb();
    const query = search ? `%${search}%` : "%";

    // Base WHERE clause (always present)
    let conditions = "(s.name LIKE ? OR s.id LIKE ? OR s.reg_no LIKE ?)";
    const params = [query, query, query];

    // Optional class/arm filter (normalised, handles "JSS 1 Gold" or "JSS 1")
    if (class_name) {
      const normClass = class_name.replace(/\s+/g, '').toUpperCase();
      conditions += " AND UPPER(replace(s.class_name || COALESCE(' ' || NULLIF(s.class_arm, ''), ''), ' ', '')) = ?";
      params.push(normClass);
    }

    // Optional subject filter — student must be enrolled in this subject
    if (subject) {
      conditions += " AND EXISTS (SELECT 1 FROM student_subjects ss WHERE ss.student_id = s.id AND ss.subject = ?)";
      params.push(subject);
    }

    // Optional teacher filter — student's class must be allocated to this teacher
    if (teacher_id) {
      conditions += ` AND UPPER(replace(s.class_name || COALESCE(' ' || NULLIF(s.class_arm, ''), ''), ' ', ''))
        IN (SELECT UPPER(replace(class_name, ' ', '')) FROM teacher_allocations WHERE teacher_id = ?)`;
      params.push(teacher_id);
    }

    // Optional no-arm filter — students with no arm assignment
    if (no_arm) {
      conditions += " AND (s.class_arm = '' OR s.class_arm IS NULL)";
    }

    const totalSql   = `SELECT COUNT(*) as total FROM students s WHERE ${conditions}`;
    const selectSql  = `SELECT s.id, s.name, s.class_name, COALESCE(s.class_arm, '') as class_arm, s.reg_no, s.gender, s.dob, s.photo, s.parent_email, s.parent_phone, s.parent_name, s.fee_status FROM students s WHERE ${conditions} ORDER BY s.class_name ASC, s.name ASC LIMIT ? OFFSET ?`;

    const total    = db.prepare(totalSql).get(...params).total;
    const students = db.prepare(selectSql).all(...params, limit, offset);

    // Attach subject enrollment if not minimal
    if (!minimal) {
      const stmt = db.prepare("SELECT subject FROM student_subjects WHERE student_id = ?");
      for (const student of students) {
        student.subjects = stmt.all(student.id).map(row => row.subject);
      }
    } else {
      for (const student of students) {
        student.subjects = [];
      }
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
    // Ensure new column exists for DBs that haven't restarted since migration was added
    try { db.exec("ALTER TABLE school_term_config ADD COLUMN exclude_unregistered_from_totals INTEGER DEFAULT 0"); } catch (_) {}
    db.prepare(`
      INSERT INTO school_term_config
        (id, academic_session, term, resumption_date, term_start_date, term_end_date,
         grading_scale, show_position, show_domains, show_attendance, attendance_score_weight, template,
         include_attendance_in_grades, exclude_unregistered_from_totals)
      VALUES
        (1, @academic_session, @term, @resumption_date, @term_start_date, @term_end_date,
         @grading_scale, @show_position, @show_domains, @show_attendance, @attendance_score_weight, @template,
         @include_attendance_in_grades, @exclude_unregistered_from_totals)
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
        template         = excluded.template,
        include_attendance_in_grades = excluded.include_attendance_in_grades,
        exclude_unregistered_from_totals = excluded.exclude_unregistered_from_totals
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
      include_attendance_in_grades: config.include_attendance_in_grades !== false && config.include_attendance_in_grades !== 0 ? 1 : 0,
      exclude_unregistered_from_totals: config.exclude_unregistered_from_totals ? 1 : 0,
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

  const balRow = termOrNull
    ? db.prepare(`SELECT COALESCE(SUM(total_billed - total_paid), 0) AS bal FROM student_fees WHERE student_id = ? AND academic_session = ? AND term = ?`).get(studentId, session, termOrNull)
    : db.prepare(`SELECT COALESCE(SUM(total_billed - total_paid), 0) AS bal FROM student_fees WHERE student_id = ? AND academic_session = ?`).get(studentId, session);
  const balance = balRow?.bal || 0;

  const billedRow = db.prepare(`SELECT COALESCE(SUM(total_billed), 0) AS b FROM student_fees WHERE student_id = ? AND academic_session = ?`).get(studentId, session);
  const totalBilled = billedRow?.b || 0;

  return feeCalculator.evaluateFeeGate({ enabled, mode, threshold, balance, totalBilled });
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
 * fees:get-summary — aggregates outstanding totals and counts across matching students.
 */
ipcMain.handle("fees:get-summary", (event, { academic_session, term, search = "" }) => {
  try {
    const db = database.getDb();
    const query = search ? `%${search}%` : "%";

    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN COALESCE(f.total_billed, 0) > COALESCE(f.total_paid, 0) THEN COALESCE(f.total_billed, 0) - COALESCE(f.total_paid, 0) ELSE 0 END), 0) AS outstanding,
        SUM(CASE WHEN COALESCE(f.total_billed, 0) <= COALESCE(f.total_paid, 0) AND COALESCE(f.total_billed, 0) > 0 THEN 1 ELSE 0 END) AS cleared,
        SUM(CASE WHEN COALESCE(f.total_paid, 0) > 0 AND COALESCE(f.total_billed, 0) > COALESCE(f.total_paid, 0) THEN 1 ELSE 0 END) AS partial,
        SUM(CASE WHEN COALESCE(f.total_paid, 0) = 0 AND COALESCE(f.total_billed, 0) > 0 THEN 1 ELSE 0 END) AS unpaid,
        COUNT(*) AS total
      FROM students s
      LEFT JOIN student_fees f
        ON  f.student_id       = s.id
        AND f.academic_session = ?
        AND f.term             = ?
      WHERE s.name LIKE ? OR s.id LIKE ?
    `).get(academic_session, term, query, query);

    return { ok: true, data: summary || { outstanding: 0, cleared: 0, partial: 0, unpaid: 0, total: 0 } };
  } catch (err) {
    console.error("[Fees] get-summary error:", err);
    return { ok: false, error: err.message, data: { outstanding: 0, cleared: 0, partial: 0, unpaid: 0, total: 0 } };
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
    const status = feeCalculator.computeFeeStatus(billed, paid);
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

      const status = feeCalculator.computeFeeStatus(existing.total_billed, total_paid);

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
    const records = db.prepare("SELECT * FROM daily_attendance WHERE UPPER(replace(class_name, ' ', '')) = ? AND date = ?").all(class_name.replace(/\s+/g, '').toUpperCase(), date);
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
  // ── Silver / Standalone plan: only 'all' scope permitted ──────────────────
  const _qrTier = licenseStatus?.tier || 'Silver';
  if ((_qrTier === 'Silver' || _qrTier === 'Standalone') && scope && scope !== 'all') {
    return { ok: false, error: 'Generating individual, class, or subject reports requires a Gold or Diamond plan. Contact your Nexus Partner to upgrade.', results: [] };
  }
  try {
    const db = database.getDb();

    // Load max_subjects config once per batch for stable-average denominator
    const _maxSubjectsMap = {};
    try {
      db.prepare("SELECT hierarchy_class, max_subjects FROM class_configs").all()
        .forEach(c => { _maxSubjectsMap[c.hierarchy_class] = c.max_subjects; });
    } catch (_) { /* table may not exist on older installs */ }
    // Prefix-matching helper (class_name may include arm, e.g. "SS1 Gold")
    const _resolveMax = (cn) => {
      if (!cn) return null;
      const normCn = cn.replace(/\s+/g, '').toUpperCase();
      // 1. Exact normalized match
      for (const key of Object.keys(_maxSubjectsMap)) {
        if (normCn === key.replace(/\s+/g, '').toUpperCase()) {
          return _maxSubjectsMap[key];
        }
      }
      // 2. Longest-prefix match (most specific key first)
      const keys = Object.keys(_maxSubjectsMap).sort((a, b) => {
        return b.replace(/\s+/g, '').length - a.replace(/\s+/g, '').length;
      });
      for (const key of keys) {
        const normKey = key.replace(/\s+/g, '').toUpperCase();
        if (normCn.startsWith(normKey)) {
          const v = _maxSubjectsMap[key];
          if (v != null && v > 0) return v;
        }
      }
      return null;
    };

    // Build student roster depending on scope
    let students;
    if (scope === "student" && student_id) {
      students = db.prepare("SELECT * FROM students WHERE id = ?").all(student_id);
    } else if (scope === "class" && class_name) {
      students = db.prepare("SELECT * FROM students WHERE UPPER(replace(class_name || COALESCE(' ' || NULLIF(class_arm, ''), ''), ' ', '')) = ? ORDER BY name ASC").all(class_name.replace(/\s+/g, '').toUpperCase());
    } else if (scope === "teacher" && teacher_id) {
      // Students who are enrolled in at least one of this teacher's allocated subjects.
      // The LEFT JOIN + GROUP BY approach keeps students who have student_subjects rows
      // that match; the HAVING clause filters to only those with ≥1 matching enrollment.
      // Falls back gracefully: if a student has NO rows in student_subjects at all
      // (e.g. imported via CSV before the subject fix), they are still included so
      // report data is never silently suppressed for legacy records.
      students = db.prepare(`
        SELECT DISTINCT s.* FROM students s
        JOIN teacher_allocations a ON UPPER(replace(s.class_name || COALESCE(' ' || NULLIF(s.class_arm, ''), ''), ' ', '')) = UPPER(replace(a.class_name, ' ', ''))
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

    // Determine whether to exclude unregistered subjects from totals/averages.
    // Ensure column exists first (DBs not yet restarted after migration), then read safely.
    let excludeUnregisteredFromTotals = false;
    try {
      try { db.exec("ALTER TABLE school_term_config ADD COLUMN exclude_unregistered_from_totals INTEGER DEFAULT 0"); } catch (_) {}
      const termCfgForExclude = db.prepare("SELECT exclude_unregistered_from_totals FROM school_term_config WHERE id = 1").get() || {};
      excludeUnregisteredFromTotals = termCfgForExclude.exclude_unregistered_from_totals === 1;
    } catch (_) { /* safety net — defaults to false */ }
    
    const getTermAttendance = db.prepare(
      "SELECT total_days, days_attended FROM student_attendance WHERE student_id = ? AND academic_session = ? AND term = ?"
    );
    
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
      
      // Build a Set of registered subject names for O(1) lookup
      const explicitSubjsSet = new Set(explicitSubjs);

      // Seed registered subjects first (score may remain null if not yet graded)
      explicitSubjs.forEach(sName => {
        resolvedSubjects.set(sName, { name: sName, score: null, breakdown: {}, isRegistered: true });
      });

      // Merge grade records; tag each as registered (in student_subjects) or unregistered (score recorded but no formal enrolment)
      records.forEach(r => {
        resolvedSubjects.set(r.subject, {
          name: r.subject,
          score: r.score,
          breakdown: (() => { try { const p = JSON.parse(r.breakdown); return (p && typeof p === 'object') ? p : {}; } catch { return {}; } })(),
          isRegistered: explicitSubjsSet.has(r.subject),
        });
      });

      let allSubjectsArray = Array.from(resolvedSubjects.values());
      if (scope === "subject" && subject) {
        allSubjectsArray = allSubjectsArray.filter(s => s.name === subject);
      }

      // Filter out zero-score empty subjects so avg isn't polluted by ungraded subjects.
      // When the admin has chosen to exclude unregistered courses, only use registered subjects for totals.
      const gradedSubjects = allSubjectsArray.filter(s =>
        s.score !== null && (!excludeUnregisteredFromTotals || s.isRegistered)
      );
      const totalScore = gradedSubjects.reduce((sum, s) => sum + s.score, 0);
      // Use max_subjects as denominator when configured (stable average)
      const _maxSubs = _resolveMax(stu.class_name);
      const _denom = (_maxSubs && _maxSubs > 0) ? _maxSubs : gradedSubjects.length;
      const avg = gradedSubjects.length ? (totalScore / _denom).toFixed(2) : "—";

      const domains = getDomains.all(stu.id, session, term);
      const remark = getRemark.get(stu.id, session, term) || {};
      const fullClassName = (stu.class_arm && !stu.class_name.includes(stu.class_arm))
        ? `${stu.class_name} ${stu.class_arm}`
        : stu.class_name;

      // NEW: Look up form teacher for this class
      const ft = formTeacherMap.get(fullClassName) || {};

      // Resolve attendance: check term-level student_attendance first, then fall back to daily roll calls
      const termAtt = getTermAttendance.get(stu.id, session, term);
      let classTotalDays = 0;
      let daysAttended = 0;
      if (termAtt) {
        classTotalDays = termAtt.total_days;
        daysAttended = termAtt.days_attended;
      } else {
        classTotalDays = classDaysMap.get(fullClassName) || 0;
        const attRow = getStudentAttendanceCount.get(stu.id, session, term) || { days_attended: 0 };
        daysAttended = attRow.days_attended;
      }

      // V2.2: Resolve official stamp
      let schoolStamp = identityPacket.stamp || null;
      if (identityPacket.stampStyle && identityPacket.stampStyle !== "none" && !schoolStamp) {
        const stampColor = identityPacket.stampCustomColor || (identityPacket.tier === "Silver" ? "#0D47A1" : identityPacket.themePrimary);
        schoolStamp = generateStampSVG(identityPacket.stampStyle, identityPacket.name, null, identityPacket.signature, stampColor);
      }

      return {
        ...stu,
        class_name: fullClassName,
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

// ── Admin Grade Viewer ────────────────────────────────────────────────────────
// Returns all subject scores + breakdowns for a student in the active session/term.
ipcMain.handle("get-student-grades", (event, { student_id }) => {
  try {
    const db = database.getDb();
    const termConfig = db.prepare("SELECT academic_session, term FROM school_term_config WHERE id = 1").get();
    if (!termConfig) return { ok: false, error: "Term config not found" };
    const { academic_session, term } = termConfig;

    const rows = db.prepare(
      `SELECT subject, MAX(score) AS score,
              (SELECT breakdown FROM student_records r2
               WHERE r2.student_id = r.student_id
                 AND r2.academic_session = r.academic_session
                 AND r2.term = r.term
                 AND r2.subject = r.subject
               ORDER BY r2.score DESC, r2.rowid DESC LIMIT 1) AS breakdown
       FROM student_records r
       WHERE student_id = ? AND academic_session = ? AND term = ?
       GROUP BY subject
       ORDER BY subject ASC`
    ).all(student_id, academic_session, term);

    const grades = rows.map(r => ({
      subject: r.subject,
      score: r.score,
      breakdown: (() => { try { const p = JSON.parse(r.breakdown); return (p && typeof p === 'object') ? p : {}; } catch { return {}; } })(),
    }));

    return { ok: true, grades, session: academic_session, term };
  } catch (err) {
    console.error("[get-student-grades] Error:", err.message);
    return { ok: false, error: err.message };
  }
});

// ── Admin Grade Editor (Sudo-protected on the frontend) ───────────────────────
// Receives: { student_id, grades: [{ subject, breakdown: { CA1, CA2, Exam, ... } }] }
// Recomputes the total score from breakdown values and upserts each record.
ipcMain.handle("save-student-grades", (event, { student_id, grades }) => {
  try {
    const db = database.getDb();
    const termConfig = db.prepare("SELECT academic_session, term FROM school_term_config WHERE id = 1").get();
    if (!termConfig) return { ok: false, error: "Term config not found" };
    const { academic_session, term } = termConfig;

    // The student_records UNIQUE key includes `assessment`, so a plain ON CONFLICT
    // on (student_id, academic_session, term, subject) fails.  Instead, delete all
    // existing rows for this student/subject/session/term and insert one clean
    // consolidated row (assessment = 'FULL') that carries the full breakdown JSON.
    const deleteRow = db.prepare(`
      DELETE FROM student_records
      WHERE student_id = ? AND academic_session = ? AND term = ? AND subject = ?
    `);

    const insertRow = db.prepare(`
      INSERT INTO student_records
        (student_id, academic_session, term, subject, assessment, score, breakdown)
      VALUES (?, ?, ?, ?, 'FULL', ?, ?)
    `);

    const saveAll = db.transaction((items) => {
      for (const item of items) {
        const rawBd = item.breakdown || {};
        const bd = {};
        for (const [k, v] of Object.entries(rawBd)) {
          bd[k] = Math.round((Number(v) || 0) * 100) / 100;
        }
        // If no sub-components exist use the passed score directly (flat-score grade)
        const totalRaw = Object.keys(bd).length > 0
          ? Object.values(bd).reduce((sum, v) => sum + (Number(v) || 0), 0)
          : (Number(item.score) || 0);
        const total = Math.round(totalRaw * 100) / 100;
        deleteRow.run(student_id, academic_session, term, item.subject);
        insertRow.run(student_id, academic_session, term, item.subject, total, JSON.stringify(bd));
      }
    });

    saveAll(grades);
    return { ok: true };
  } catch (err) {
    console.error("[save-student-grades] Error:", err.message);
    return { ok: false, error: err.message };
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
      WHERE (`+ (class_name ? `UPPER(replace(s.class_name, ' ', '')) = @class_name AND ` : '') +`
            sa.academic_session = @session AND sa.term = @term)
    `).all({ class_name: class_name ? class_name.replace(/\s+/g, '').toUpperCase() : '', session: session || '2024/2025', term: term || 'First Term' });
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
    // One-time idempotent migration: expand any bare hierarchy class names
    // (e.g. "JSS 1") stored in form_teachers to their arm-expanded form
    // (e.g. "JSS 1 Gold") so they match the fullList used by the modal.
    // Rows whose class_name already includes an arm are unaffected because
    // class_arms.hierarchy_class only stores the base name (e.g. "JSS 1").
    db.prepare(`
      UPDATE form_teachers
      SET class_name = class_name || ' ' || (
        SELECT arm FROM class_arms
        WHERE hierarchy_class = form_teachers.class_name
        ORDER BY rowid LIMIT 1
      )
      WHERE EXISTS (
        SELECT 1 FROM class_arms WHERE hierarchy_class = form_teachers.class_name
      )
    `).run();
    // LEFT JOIN so orphaned mappings (teacher deleted) still surface rather
    // than being silently hidden.
    const rows = db.prepare(`
      SELECT f.class_name, f.teacher_id, t.name as teacher_name 
      FROM form_teachers f
      LEFT JOIN teachers t ON f.teacher_id = t.id
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

    // ── Keep app_settings.school_identity and school_name in sync
    try {
      const db = database.getDb();
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('school_identity', ?)").run(JSON.stringify(identityPacket));
      if (identityPacket.name) {
        db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('school_name', ?)").run(identityPacket.name);
      }
    } catch (dbErr) {
      console.warn("[Identity] Could not sync school_identity/school_name to DB:", dbErr.message);
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

  // 1. Clear the database FIRST — if this fails we must NOT relaunch
  // (clearData now throws on failure so the try-catch below catches it)
  try {
    clearData();
    console.log("[Electron] Database cleared successfully.");
  } catch (err) {
    console.error("[Electron] RESET ABORTED — clearData failed:", err.message);
    return { ok: false, error: `Database clear failed: ${err.message}` };
  }

  // 2. Reset identity packet to default
  identityPacket = {
    name: "Green Valley High",
    themePrimary: "#1A237E",
    themeSecondary: "#00E5FF",
    logoBase64: null,
    address: "",
    motto: "",
    signature: "",
  };

  // 3. Clear identity.json
  try {
    if (identityFilePath && fs.existsSync(identityFilePath)) {
      fs.unlinkSync(identityFilePath);
      console.log("[Electron] identity.json deleted.");
    }
  } catch (err) {
    console.error("Failed to delete identity.json", err);
  }

  // 4. Clear Scholar Knowledge index
  try {
    scholar.clearIndex();
    console.log("[Electron] Scholar index cleared.");
  } catch (err) {
    console.error("Failed to clear Scholar index", err);
  }

  // 5. Disconnect WhatsApp Bot and wipe session folder
  try {
    pulseBot.destroyPulse();
    const pulseAuthPath = require('path').join(require('os').homedir(), ".nexus_pulse_auth");
    if (fs.existsSync(pulseAuthPath)) {
      fs.rmSync(pulseAuthPath, { recursive: true, force: true });
      console.log("[Electron] WhatsApp session folder cleared.");
    }
  } catch (err) {
    console.error("Failed to destroy WhatsApp Pulse session folder:", err);
  }

  // 6. Update QR Payload
  if (qrPayload) {
    qrPayload.config = identityPacket;
    setSchoolConfig(qrPayload.config);
  }

  // 7. Relaunch cleanly — only reached if clearData() succeeded
  console.log("[Electron] App data reset complete. Relaunching application...");
  app.relaunch();
  app.exit(0);

  return { ok: true };
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
  let tempDir = "";
  // Keep display awake for the duration of report generation
  const sleepBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  try {
    const startTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const outFolderBase = path.join(app.getPath("desktop"), "NexusReports");
    const outFolder = path.join(outFolderBase, `Reports_${timestamp}`);
    if (!fs.existsSync(outFolder)) fs.mkdirSync(outFolder, { recursive: true });

    mainWindow?.webContents.send("report-generation:status", { text: "⏳ Querying student metrics..." });

    const db = database.getDb();
    if (payload.students) {
      const _licTier = licenseStatus?.tier || identityPacket?.planTier || identityPacket?.plan_tier || 'Standalone';
      const _feeGated = _licTier === 'Gold' || _licTier === 'Diamond';

      // Hoist statements to avoid re-preparing on every student in the loop
      const feeStmt = _feeGated ? db.prepare(
        `SELECT status FROM student_fees WHERE student_id = ? AND academic_session = ? AND term = ? LIMIT 1`
      ) : null;

      let attStmt = null;
      try {
        attStmt = db.prepare(`SELECT subject_name, total_classes, classes_attended FROM subject_attendance_agg WHERE student_id = ? AND academic_session = ? AND term = ?`);
      } catch (_) {}

      for (const s of payload.students) {
        if (!_feeGated) {
          s.feeStatus = 'cleared';
        } else {
          try {
            const feeRow = feeStmt.get(s.id, termConfig?.academic_session, termConfig?.term);
            s.feeStatus = feeRow?.status ?? 'cleared';
          } catch (feeErr) {
            s.feeStatus = 'cleared';
          }
        }

        if (attStmt) {
          try {
            const subAtt = attStmt.all(s.id, termConfig?.academic_session, termConfig?.term);
            if (subAtt && subAtt.length > 0) s.subject_attendance_agg = subAtt;
          } catch (e) {}
        }
      }
    }

    mainWindow?.webContents.send("report-generation:status", { text: "⏳ Saving templates and asset cache..." });

    let baseDir = path.join(__dirname, "../../private_engine");
    if (!fs.existsSync(baseDir) || !fs.existsSync(path.join(baseDir, "assets", "templates"))) {
        try {
            baseDir = path.dirname(require.resolve("@nexus/engine"));
        } catch (_) {}
    }

    // Create unique temp directory under OS tmpdir for de-duplicated image storage
    tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'nexus-reports-'));

    let finalOutPath = outFolder;

    if (reportType !== "broadsheet" && payload.students && payload.students.length > 0) {
        // Group students by class_name (resolving class_arm if present)
        const classGroups = {};
        for (const s of payload.students) {
            if (s.class_arm && s.class_name && !s.class_name.includes(s.class_arm)) {
                s.class_name = `${s.class_name} ${s.class_arm}`;
            }
            const cn = (s.class_name || "Unassigned").trim();
            if (!classGroups[cn]) classGroups[cn] = [];
            classGroups[cn].push(s);
        }
        const classNames = Object.keys(classGroups).sort();

        for (const cn of classNames) {
            const groupStudents = classGroups[cn];
            mainWindow?.webContents.send("report-generation:status", { text: `⏳ Rendering reports for ${cn} (${groupStudents.length} students)...` });

            const groupPayload = {
                ...payload,
                students: groupStudents
            };

            let groupHtml = "";
            const safeClassName = cn.replace(/[^a-zA-Z0-9]/g, "_");
            let groupOutPath = path.join(outFolder, `${reportType === "portal_card" ? "Parent_Access_Cards" : "TerminalReport"}_${safeClassName}_${termConfig?.term?.replace(/\s/g,"_")||"Term"}.${format === "image" ? "png" : "pdf"}`);
            finalOutPath = groupOutPath;

            if (reportType === "portal_card") {
                groupHtml = reports.generatePortalCards(groupPayload);
            } else {
                groupHtml = reports.generateHTMLPages(groupPayload, baseDir, tempDir);
            }

            if (format === "html") {
                 groupOutPath = groupOutPath.replace(".pdf", ".html").replace(".png", ".html");
                 finalOutPath = groupOutPath;
                 fs.writeFileSync(groupOutPath, groupHtml, "utf8");
                 continue;
            }

            // Write temp HTML file
            const groupHtmlPath = path.join(tempDir, `nexus_report_${safeClassName}.html`);
            fs.writeFileSync(groupHtmlPath, groupHtml, "utf8");

            await new Promise((resolve, reject) => {
                let hw = new BrowserWindow({
                  show: false,
                  width: 794,
                  height: 1123,
                  webPreferences: {
                    offscreen: true,
                    webSecurity: false // Allow loading file:// URLs for local temp images
                  }
                });
                hw.loadFile(groupHtmlPath);
                hw.webContents.on("did-finish-load", async () => {
                  try {
                    // Wait a brief tick (e.g. 200ms) for file:// images to decode and render completely before printing
                    await new Promise(r => setTimeout(r, 200));

                    if (format === "image") {
                      const image = await hw.webContents.capturePage();
                      fs.writeFileSync(groupOutPath, image.toPNG());
                    } else {
                      const buf = await hw.webContents.printToPDF({
                        printBackground: true,
                        pageSize: "A4",
                        landscape: false
                      });
                      fs.writeFileSync(groupOutPath, buf);
                    }
                    hw.close(); hw = null;
                    resolve();
                  } catch(e) { hw?.close(); reject(e); }
                });
            });
        }
    } else {
        // Broadsheet or empty students list
        mainWindow?.webContents.send("report-generation:status", { text: `⏳ Rendering Broadsheet...` });
        const html = reports.generateBroadsheetHTML(payload);
        const outPath = path.join(outFolder, `Broadsheet_${payload.subject?.replace(/\s/g,"_")}.${format === "image" ? "png" : "pdf"}`);
        finalOutPath = outPath;

        if (format === "html") {
             const htmlPath = outPath.replace(".pdf", ".html").replace(".png", ".html");
             finalOutPath = htmlPath;
             fs.writeFileSync(htmlPath, html, "utf8");
        } else {
             const tempHtmlPath = path.join(tempDir, `nexus_broadsheet_temp.html`);
             fs.writeFileSync(tempHtmlPath, html, "utf8");

             await new Promise((resolve, reject) => {
                 let hw = new BrowserWindow({
                   show: false,
                   width: 1123, // landscape broadsheet width
                   height: 794,
                   webPreferences: {
                     offscreen: true,
                     webSecurity: false
                   }
                 });
                 hw.loadFile(tempHtmlPath);
                 hw.webContents.on("did-finish-load", async () => {
                   try {
                     await new Promise(r => setTimeout(r, 200));

                     if (format === "image") {
                       const image = await hw.webContents.capturePage();
                       fs.writeFileSync(outPath, image.toPNG());
                     } else {
                       const buf = await hw.webContents.printToPDF({
                         printBackground: true,
                         pageSize: "A4",
                         landscape: true
                       });
                       fs.writeFileSync(outPath, buf);
                     }
                     hw.close(); hw = null;
                     resolve();
                   } catch(e) { hw?.close(); reject(e); }
                 });
             });
        }
    }

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Electron] Printed ${payload.students?.length || 0} reports in ${durationSec}s`);
    try {
      const scope = payload.scope || 'all';
      let eventType = 'PRINT_REPORTS';
      if (scope === 'all') eventType = 'PRINT_REPORTS_SCHOOL';
      else if (scope === 'class') eventType = 'PRINT_REPORTS_CLASS';
      else if (scope === 'teacher') eventType = 'PRINT_REPORTS_TEACHER';
      else if (scope === 'student') eventType = 'PRINT_REPORTS_STUDENT';
      else if (scope === 'subject') eventType = 'PRINT_REPORTS_SUBJECT';

      const adminLabel = currentAdminSession?.username || 'Admin';

      logActivity({
        event_type: eventType,
        actor_label: adminLabel,
        device_id: 'DESKTOP',
        payload_hash: '',
        payload: {
          action: 'print_reports',
          count: payload.students?.length || 0,
          format,
          scope,
          targetName: scope === 'class' ? payload.selectedClass
                    : scope === 'teacher' ? payload.selectedTeacherName
                    : scope === 'student' ? payload.selectedStudentName
                    : scope === 'subject' ? payload.selectedSubject
                    : undefined,
          durationSeconds: parseFloat(durationSec)
        }
      });

      // Also log to the relational audit_logs table
      const adminId = currentAdminSession ? currentAdminSession.id : null;
      let details = `Printed ${payload.students?.length || 0} reports (${format.toUpperCase()}).`;
      if (scope === 'all') details += ' Scope: Entire School.';
      else if (scope === 'class' && payload.selectedClass) details += ` Scope: Class (${payload.selectedClass}).`;
      else if (scope === 'teacher' && payload.selectedTeacherName) details += ` Scope: Teacher (${payload.selectedTeacherName}).`;
      else if (scope === 'student' && payload.selectedStudentName) details += ` Scope: Student (${payload.selectedStudentName}).`;
      else if (scope === 'subject' && payload.selectedSubject) details += ` Scope: Subject (${payload.selectedSubject}).`;

      db.prepare(`
        INSERT INTO audit_logs (admin_id, action, target, details)
        VALUES (?, 'PRINT_REPORTS', 'student_records', ?)
      `).run(adminId, details);
    } catch (_) {}

    require('electron').shell.openPath(outFolder);
    return { success: true, path: finalOutPath, folder: outFolder, format };

  } catch (err) {
    console.error(`[Electron] Report generation failed:`, err);
    throw err;
  } finally {
    // Release the screen wake-lock whether generation succeeded or failed
    if (powerSaveBlocker.isStarted(sleepBlockerId)) powerSaveBlocker.stop(sleepBlockerId);
    // Deterministic Cleanup: remove the temporary directory and all generated image files recursively
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.error("[Electron] Failed to clean up tempDir:", e);
      }
    }
  }
});







function createWindow() {
  // ── Initialize Persistence First ──────────────────────────────────────────
  try {
    const userDataPath = app.getPath("userData");
    identityFilePath = path.join(userDataPath, "identity.json");

    // Initialize SQLite Database — always use the user's persistent data directory
    let dbPath = path.join(userDataPath, 'nexus_os.db');
    scholar.init(userDataPath);

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

    // Load identity from SQLite DB if it exists, otherwise fall back to identity.json
    try {
      const db = database.getDb();
      const row = db.prepare("SELECT value FROM app_settings WHERE key = 'school_identity'").get();
      if (row && row.value) {
        identityPacket = JSON.parse(row.value);
        console.log(`[Database] Loaded school_identity from DB for: "${identityPacket.name || 'N/A'}"`);
        fs.writeFileSync(identityFilePath, JSON.stringify(identityPacket, null, 2));
      } else if (fs.existsSync(identityFilePath)) {
        const data = fs.readFileSync(identityFilePath, "utf-8");
        identityPacket = JSON.parse(data);
        db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('school_identity', ?)").run(JSON.stringify(identityPacket));
        if (identityPacket.name) {
          db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('school_name', ?)").run(identityPacket.name);
        }
      } else {
        fs.writeFileSync(
          identityFilePath,
          JSON.stringify(identityPacket, null, 2),
        );
      }
    } catch (e) {
      console.warn("[Database] Could not read/sync school_identity during startup:", e.message);
      if (fs.existsSync(identityFilePath)) {
        try {
          const data = fs.readFileSync(identityFilePath, "utf-8");
          identityPacket = JSON.parse(data);
        } catch (_) {}
      }
    }
    setSchoolConfig(identityPacket);
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
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      // macOS Application menu (first item named after the app)
      ...(isMac ? [{
        label: app.getName(),
        submenu: [
          { label: 'About NexusSchoolOS', click: () => mainWindow?.webContents.send('navigate-to', 'about') },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      }] : []),

      // File (Windows / Linux only — macOS uses the app menu above)
      ...(!isMac ? [{
        label: 'File',
        submenu: [
          { label: 'About NexusSchoolOS', click: () => mainWindow?.webContents.send('navigate-to', 'about') },
          { type: 'separator' },
          { role: 'quit', label: 'Exit' },
        ],
      }] : []),

      // Edit — provides system clipboard integration (copy/paste in inputs)
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut'  },
          { role: 'copy' },
          { role: 'paste' },
          ...(isMac ? [{ role: 'pasteAndMatchStyle' }] : []),
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' },
        ],
      },

      // View
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          ...(!app.isPackaged ? [{ role: 'toggleDevTools', label: 'Developer Tools' }] : []),
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn'   },
          { role: 'zoomOut'  },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },

      // Window
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          ...(isMac ? [
            { type: 'separator' },
            { role: 'front' },
            { role: 'zoom'  },
          ] : [
            { role: 'close' },
          ]),
        ],
      },

      // Help
      {
        role: 'help',
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
          { type: 'separator' },
          {
            label: 'View Portal',
            click: () => shell.openExternal(process.env.NEXUSOS_PORTAL_URL || 'https://nexusos.com.ng/portal'),
          },
          {
            label: 'Contact Support',
            // BCC silently copies the Brytebee team on every support email
            click: () => shell.openExternal(
              'mailto:sch-support@nexusos.com.ng'
              + '?subject=Support%20Request%20%E2%80%94%20NexusSchoolOS'
              + '&bcc=brytebee%40gmail.com'
            ),
          },
          {
            label: 'Report a Bug',
            click: () => shell.openExternal(
              'mailto:sch-support@nexusos.com.ng'
              + '?subject=Bug%20Report%20%E2%80%94%20NexusSchoolOS'
              + '&bcc=brytebee%40gmail.com'
            ),
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
  if (process.env.DEV_TEST_LOCK) {
    licenseStatus = { locked: true, reason: process.env.DEV_TEST_LOCK };
  }

  let bootFile = 'lock.html';
  if (licenseStatus.locked) {
    let hash = 'default';
    if (licenseStatus.reason === 'no_license') {
      hash = 'invalid';
    } else if (licenseStatus.reason === 'expired') {
      hash = 'expired';
    } else if (licenseStatus.reason === 'revoked') {
      hash = 'revoked';
    } else if (licenseStatus.reason === 'trial_end') {
      hash = 'trial_end';
    } else if (['tampered', 'invalid_tier', 'hardware_mismatch', 'internal_error'].includes(licenseStatus.reason)) {
      hash = 'tampered';
    }
    bootFile = `lock.html#${hash}`;
    console.log(`[License] System is LOCKED due to ${licenseStatus.reason || 'restriction'}. Loading ${bootFile}`);
  } else if (process.env.DEV_AUTO_LOGIN === 'true') {
    currentAdminSession = { id: 1, name: 'Developer', role: 'super_admin', loginAt: Date.now() };
    console.log('[Auth] DEV_AUTO_LOGIN active — skipping lock screen.');
    bootFile = process.env.USE_REACT_UI === 'true' ? 'dist/renderer.html' : 'index.html';
  }
  mainWindow.loadFile(bootFile);


  // Start the message queue worker now that the main window exists
  const bootTier = licenseStatus?.tier || 'Silver';
  if (bootTier !== 'Standalone' && bootTier !== 'Silver') {
    startMessageQueueWorker();
    pulseBot.initPulseBot(mainWindow);
    const dbApp = database.getDb();
    const autoStart = dbApp.prepare("SELECT value FROM app_settings WHERE key = 'pulse_autostart'").get();
    if (autoStart && autoStart.value === 'true') {
      console.log('[Pulse] Auto-start is enabled. Starting bot...');
      pulseBot.startPulse();
    }
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
  callbackServer.listen(3004, () => console.log("[Pulse] Google Auth callback server listening on port 3004"));

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

  portalApp.use(express.json({ limit: '50mb' }));
  portalApp.use(express.urlencoded({ limit: '50mb', extended: true }));

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

      // Generate a real random 4-digit PIN
      const pin = Math.floor(1000 + Math.random() * 9000).toString();
      const expiry = Date.now() + (12 * 60 * 60 * 1000); // 12 Hours

      // Query WhatsApp bot status first
      let botActive = false;
      try {
        const botStatus = await pulseBot.getPulseStatus();
        if (botStatus && botStatus.status === 'ready') {
          botActive = true;
        }
      } catch (e) {
        console.error("[Portal] Failed to query bot status:", e);
      }

      if (botActive) {
        const students = db.prepare("SELECT id, name, class_name FROM students WHERE parent_phone LIKE ?").all(`%${matchable}`);
        if (!students.length) {
          return res.json({
            ok: false,
            error: `No students found for this number. Ensure it matches the number registered at the school (last 10 digits used: ${matchable}).`
          });
        }

        console.log(`[Sovereign Portal] Generated auth PIN: ${pin} for phone: ${phone} (matchable: ${matchable})`);
        portalSessions.set(matchable, { pin, expiry, students });

        try {
          await pulseBot.sendOTP(phone, pin, identityPacket.name || "Nexus School");
          return res.json({ ok: true, message: 'OTP sent via WhatsApp' });
        } catch (e) {
          console.error("[Portal] WhatsApp direct send failed. Queueing message...", e);
          try {
            db.prepare(`
              INSERT INTO pending_pulse_messages (phone, message, type)
              VALUES (?, ?, 'otp')
            `).run(phone, `Nexus Portal Login PIN: ${pin}`);
            return res.json({ ok: true, message: 'WhatsApp direct delivery failed. Message queued. Please ensure Nexus Pulse is online.' });
          } catch (queueErr) {
            console.error("[Portal] Failed to queue message:", queueErr);
            return res.json({ ok: false, error: 'Failed to send or queue OTP message.' });
          }
        }
      } else {
        // Bot is not active
        if (process.env.DEV_MODE === 'true' && process.env.DEV_PORTAL_BYPASS !== 'false') {
          const devStudents = db.prepare("SELECT id, name, class_name FROM students WHERE parent_phone LIKE ? OR parent_phone IS NULL OR parent_phone = ''").all(`%${matchable}`);
          const fallback = devStudents.length ? devStudents : db.prepare("SELECT id, name, class_name FROM students LIMIT 2").all();
          
          console.log(`[Sovereign Portal] [DEV_MODE] Bypassing OTP with PIN 0000 for phone: ${phone} (matchable: ${matchable})`);
          portalSessions.set(matchable, { pin: '0000', expiry: Date.now() + 60 * 60 * 1000, students: fallback });
          return res.json({ ok: true, message: '[DEV_MODE] Portal PIN is 0000 — WhatsApp bypassed' });
        } else {
          const students = db.prepare("SELECT id, name, class_name FROM students WHERE parent_phone LIKE ?").all(`%${matchable}`);
          if (!students.length) {
            return res.json({
              ok: false,
              error: `No students found for this number. Ensure it matches the number registered at the school (last 10 digits used: ${matchable}).`
            });
          }

          console.log(`[Sovereign Portal] Generated auth PIN: ${pin} for phone: ${phone} (matchable: ${matchable})`);
          portalSessions.set(matchable, { pin, expiry, students });

          try {
            db.prepare(`
              INSERT INTO pending_pulse_messages (phone, message, type)
              VALUES (?, ?, 'otp')
            `).run(phone, `Nexus Portal Login PIN: ${pin}`);
            return res.json({ ok: true, message: 'WhatsApp delivery queued. Please ensure Nexus Pulse is online.' });
          } catch (queueErr) {
            console.error("[Portal] Failed to queue message:", queueErr);
            return res.json({ ok: false, error: 'Failed to queue OTP message.' });
          }
        }
      }
    } catch (err) {
      console.error("[Portal] request-otp root error:", err);
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

      let attendance = db.prepare(`
        SELECT status, date FROM daily_attendance 
        WHERE student_id = ? AND academic_session = ? AND term = ?
      `).all(id, termConfig.academic_session, termConfig.term);

      if (attendance.length === 0) {
        try {
          const termAtt = db.prepare(`
            SELECT total_days, days_attended FROM student_attendance
            WHERE student_id = ? AND academic_session = ? AND term = ?
          `).get(id, termConfig.academic_session, termConfig.term);
          if (termAtt && termAtt.total_days > 0) {
            attendance = [];
            for (let i = 0; i < termAtt.days_attended; i++) {
              attendance.push({ status: 'Present', date: `Day ${i + 1}` });
            }
            const absentCount = termAtt.total_days - termAtt.days_attended;
            for (let i = 0; i < absentCount; i++) {
              attendance.push({ status: 'Absent', date: `Day ${termAtt.days_attended + i + 1}` });
            }
          }
        } catch (err) {
          console.warn('[Portal API] Failed to fetch term attendance fallback:', err.message);
        }
      }

      const fees = db.prepare(`
        SELECT total_billed, total_paid FROM student_fees 
        WHERE student_id = ? AND academic_session = ? AND term = ?
      `).get(id, termConfig.academic_session, termConfig.term) || { total_billed: 0, total_paid: 0 };

      // ── Fee Gate (Gold / Diamond only — Silver/Standalone have no financial module) ────
      const _portalTier = licenseStatus?.tier || 'Silver';
      let resultsBlocked = false;
      let resultsBlockedMsg = '';
      let resultsBlockedBalance = 0;
      if (_portalTier !== 'Silver' && _portalTier !== 'Standalone') {
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
      const DEV_VALID_TIERS = ['Standalone', 'Silver', 'Gold', 'Diamond'];
      const devTier = process.env.DEV_MOCK_TIER || 'Diamond';
      if (!DEV_VALID_TIERS.includes(devTier)) {
        // Unknown tier even in dev → lock so the locked-screen UI can be tested
        // and the bypass path cannot be exploited in a leaked dev build.
        console.error(`[Security] DEV_MOCK_TIER '${devTier}' is not a recognised tier — locking.`);
        licenseStatus = {
          locked: true,
          tier:    'INVALID',
          message: `DEV: Unrecognised tier '${devTier}'. Valid values: Standalone, Silver, Gold, Diamond.`,
          reason: 'invalid_tier',
        };
      } else {
        console.log(`[Security] DEV_MODE active (tier: ${devTier}). Bypassing expiry/hardware checks.`);
        licenseStatus = { locked: false, message: 'DEV_MODE_ACTIVE', student_count: 999999, tier: devTier };
        setSchoolLicense({ payload: JSON.stringify(licenseStatus) });
      }
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

            // 2b. Tier allowlist — must be one of the four canonical values.
            //     A valid Ed25519 signature with an unknown tier indicates either
            //     a rogue signing key or a future attack vector; lock immediately.
            const VALID_TIERS = ['Standalone', 'Silver', 'Gold', 'Diamond'];
            if (!VALID_TIERS.includes(payload.tier)) {
              console.error(`[Security] Invalid tier '${payload.tier}' in verified token — locking.`);
              licenseStatus = {
                locked: true,
                tier:    'INVALID',
                message: 'License contains an unrecognised tier. Possible tampering detected.',
                reason: 'invalid_tier',
              };

            // 3. Hardware binding check
            } else if (payload.hardware_id && payload.hardware_id !== hardwareId) {
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
    handleCSVUpload(filePath, (count, err, result) => {
      event.reply("csv-loaded", { count, warnings: result?.warnings || [] });
    });
  });

  ipcMain.on("process-grades-csv", (event, filePath) => {
    handleGradesCSVUpload(filePath, (count, err) => {
      event.reply("grades-csv-loaded", { count, error: err });
    });
  });

  ipcMain.on("process-attendance-csv", (event, filePath) => {
    handleAttendanceCSVUpload(filePath, (count, err) => {
      event.reply("attendance-csv-loaded", { count, error: err });
    });
  });

  ipcMain.on("process-classes-csv", (event, filePath) => {
    handleClassesCSVUpload(filePath, (count, err) => {
      event.reply("classes-csv-loaded", { count, error: err });
    });
  });

  // ── Fee CSV imports ────────────────────────────────────────────────────
  ipcMain.on("process-fee-structure-csv", (event, filePath) => {
    handleFeeStructureCSVUpload(filePath, (count, err) => {
      event.reply("fee-structure-csv-loaded", { count, error: err });
    });
  });

  ipcMain.on("process-fee-payment-csv", (event, filePath) => {
    handleFeePaymentCSVUpload(filePath, (count, err) => {
      event.reply("fee-payment-csv-loaded", { count, error: err });
    });
  });

  ipcMain.on("process-fee-adjustment-csv", (event, filePath) => {
    handleFeeAdjustmentCSVUpload(filePath, (count, err) => {
      event.reply("fee-adjustment-csv-loaded", { count, error: err });
    });
  });

  // ── Activity Log query (for Activity Feed UI) ───────────────────────────
  ipcMain.handle('activity-log:get', (_, { limit = 100 } = {}) => {
    try {
      const db = database.getDb();
      const rows = db.prepare(
        'SELECT * FROM activity_log ORDER BY received_at DESC LIMIT ?'
      ).all(limit);
      return { ok: true, data: rows };
    } catch (e) {
      return { ok: false, error: e.message, data: [] };
    }
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
    // Check if this launch follows a user-triggered restore.
    // The flag is written by database:restore before relaunching and is consumed once.
    const restoreFlagPath = path.join(app.getPath('userData'), '.nexus_restore_pending');
    let wasRestoredFromBackup = false;
    if (fs.existsSync(restoreFlagPath)) {
      wasRestoredFromBackup = true;
      try { fs.unlinkSync(restoreFlagPath); } catch(_) {}
      console.log('[Electron] Launch type: RESTORE — loaded from user backup.');
    } else {
      console.log('[Electron] Launch type: NORMAL.');
    }

    // Clear Impact and Purge Handlers
    ipcMain.handle("db:get-clear-impact", async (event, { type }) => {
      try {
        const db = database.getDb();
        if (type === "grades") {
          const student_records = db.prepare("SELECT COUNT(*) as c FROM student_records").get().c;
          const sync_warnings = db.prepare("SELECT COUNT(*) as c FROM sync_warnings").get().c;
          return { ok: true, counts: { student_records, sync_warnings } };
        } else if (type === "attendance") {
          const student_attendance = db.prepare("SELECT COUNT(*) as c FROM student_attendance").get().c;
          const daily_attendance = db.prepare("SELECT COUNT(*) as c FROM daily_attendance").get().c;
          const subject_attendance = db.prepare("SELECT COUNT(*) as c FROM subject_attendance").get().c;
          const subject_attendance_agg = db.prepare("SELECT COUNT(*) as c FROM subject_attendance_agg").get().c;
          const truancy_flags = db.prepare("SELECT COUNT(*) as c FROM truancy_flags").get().c;
          return { ok: true, counts: { student_attendance, daily_attendance, subject_attendance, subject_attendance_agg, truancy_flags } };
        }
        return { ok: false, error: "Invalid type" };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });

    ipcMain.handle("db:clear-data", async (event, { type }) => {
      try {
        const db = database.getDb();
        const adminId = currentAdminSession ? currentAdminSession.id : null;
        const adminLabel = currentAdminSession?.username || 'Admin';

        if (type === "grades") {
          db.transaction(() => {
            db.prepare("DELETE FROM student_records").run();
            db.prepare("DELETE FROM sync_warnings").run();
            db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'CLEAR_GRADES', 'student_records', 'All student grades and marks deleted')").run(adminId);
          })();
          
          logActivity({
            event_type: 'CLEAR_GRADES',
            actor_label: adminLabel,
            device_id: 'DESKTOP',
            payload_hash: '',
            payload: { action: 'clear_grades' }
          });
          return { ok: true };
        } else if (type === "attendance") {
          db.transaction(() => {
            db.prepare("DELETE FROM student_attendance").run();
            db.prepare("DELETE FROM daily_attendance").run();
            db.prepare("DELETE FROM subject_attendance").run();
            db.prepare("DELETE FROM subject_attendance_agg").run();
            db.prepare("DELETE FROM truancy_flags").run();
            db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'CLEAR_ATTENDANCE', 'student_attendance', 'All student attendance records deleted')").run(adminId);
          })();

          logActivity({
            event_type: 'CLEAR_ATTENDANCE',
            actor_label: adminLabel,
            device_id: 'DESKTOP',
            payload_hash: '',
            payload: { action: 'clear_attendance' }
          });
          return { ok: true };
        }
        return { ok: false, error: "Invalid type" };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });

    // Expose flag to renderer so it can show a "Restored from backup" notice
    ipcMain.handle('app:was-restored', () => wasRestoredFromBackup);

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" || process.env.DEV_MODE === "true") app.quit();
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
