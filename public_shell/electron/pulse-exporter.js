const { google } = require('googleapis');
const { database } = require('../../private_engine');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const ALGORITHM = 'aes-256-gcm';

class PulseExporter {
    constructor() {
        this.oAuth2Client = null;
        this.isSyncing = false;
    }

    /**
     * Initializes the Google OAuth2 client using credentials from DB
     */
    async init() {
        const db = database.getDb();
        const clientId = db.prepare("SELECT value FROM app_settings WHERE key = 'google_client_id'").get()?.value;
        const clientSecret = db.prepare("SELECT value FROM app_settings WHERE key = 'google_client_secret'").get()?.value;
        const redirectUri = 'http://localhost:3005/google-callback';

        if (clientId && clientSecret) {
            this.oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
            
            const tokens = db.prepare("SELECT value FROM app_settings WHERE key = 'google_tokens'").get()?.value;
            if (tokens) {
                this.oAuth2Client.setCredentials(JSON.parse(tokens));
            }
        }
    }

    /**
     * Generates or retrieves the unique AES-256 Pulse Security Key
     */
    getOrCreateSecurityKey() {
        const db = database.getDb();
        let key = db.prepare("SELECT value FROM app_settings WHERE key = 'pulse_security_key'").get()?.value;
        
        if (!key) {
            key = crypto.randomBytes(32).toString('hex');
            db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pulse_security_key', ?)").run(key);
            console.log("[Pulse Exporter] Generated new Pulse Security Key.");
        }
        return key;
    }

    /**
     * Retrieves the Google Refresh Token from local database
     */
    getRefreshToken() {
        const db = database.getDb();
        const tokensStr = db.prepare("SELECT value FROM app_settings WHERE key = 'google_tokens'").get()?.value;
        if (tokensStr) {
            try {
                const tokens = JSON.parse(tokensStr);
                return tokens.refresh_token || null;
            } catch (err) {
                console.error("[Pulse Exporter] Error parsing google_tokens JSON:", err);
                return null;
            }
        }
        return null;
    }

    /**
     * Encrypts data using AES-256-GCM
     */
    encrypt(text, key) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    }

    /**
     * Aggregates all necessary data for the Pulse Cloud Bridge
     */
    generateCache() {
        const db = database.getDb();
        const termConfig = db.prepare("SELECT * FROM school_term_config WHERE id = 1").get();
        const schoolNameRow = db.prepare("SELECT value FROM app_settings WHERE key = 'school_name'").get();
        const schoolName = schoolNameRow?.value || "Nexus School";

        const students = db.prepare(`
            SELECT id, name, class_name, parent_phone, fee_status 
            FROM students 
            WHERE parent_phone IS NOT NULL AND parent_phone != ''
        `).all();

        const data = {
            schoolName,
            termConfig,
            lastUpdated: new Date().toISOString(),
            parents: {}
        };

        for (const student of students) {
            // Normalize phone for JSON key
            const phone = student.parent_phone.replace(/\D/g, '').slice(-10);
            if (!phone) continue;

            if (!data.parents[phone]) {
                data.parents[phone] = { students: [] };
            }

            // Get results
            const results = db.prepare(`
                SELECT subject, score, term, academic_session 
                FROM student_records 
                WHERE student_id = ?
            `).all(student.id);

            // Get attendance summary
            const attendance = db.prepare(`
                SELECT date, status, term, academic_session 
                FROM daily_attendance 
                WHERE student_id = ?
            `).all(student.id);

            data.parents[phone].students.push({
                id: student.id,
                name: student.name,
                class_name: student.class_name,
                fee_status: student.fee_status,
                results,
                attendance
            });
        }

        return JSON.stringify(data);
    }

    /**
     * Exports the encrypted cache to Google Drive
     */
    async syncToDrive() {
        if (!this.oAuth2Client || this.isSyncing) return;
        this.isSyncing = true;

        try {
            const cache = this.generateCache();
            const key = this.getOrCreateSecurityKey();
            const encryptedData = this.encrypt(cache, key);

            const drive = google.drive({ version: 'v3', auth: this.oAuth2Client });
            
            // Find existing file or create new
            const response = await drive.files.list({
                q: "name = 'pulse_cache.enc' and trashed = false",
                fields: 'files(id)',
            });

            const fileMetadata = {
                name: 'pulse_cache.enc',
                mimeType: 'text/plain',
            };

            const media = {
                mimeType: 'text/plain',
                body: encryptedData,
            };

            if (response.data.files.length > 0) {
                const fileId = response.data.files[0].id;
                await drive.files.update({
                    fileId: fileId,
                    media: media,
                });
                console.log("[Pulse Exporter] Sync Successful: pulse_cache.enc updated.");
            } else {
                await drive.files.create({
                    resource: fileMetadata,
                    media: media,
                    fields: 'id',
                });
                console.log("[Pulse Exporter] Sync Successful: pulse_cache.enc created.");
            }
        } catch (err) {
            console.error("[Pulse Exporter] Sync Failed:", err);
            let errorMessage = "Sync Failed: Unknown Error";
            
            if (err.message && err.message.includes("Google Drive API has not been used")) {
                errorMessage = "Google Drive API is disabled. Please enable it in your Google Cloud Console.";
            } else if (err.code === 401) {
                errorMessage = "Authentication expired. Please link your account again.";
            }

            if (this.onSyncError) {
                this.onSyncError(errorMessage);
            }
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Start periodic sync (e.g., every 30 minutes)
     */
    startPeriodicSync(intervalMs = 30 * 60 * 1000) {
        setInterval(() => this.syncToDrive(), intervalMs);
        // Also sync immediately
        this.syncToDrive();
    }
}

module.exports = new PulseExporter();
