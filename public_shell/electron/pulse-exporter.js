const { google } = require('googleapis');
const { database } = require('@nexus/engine');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const ALGORITHM = 'aes-256-gcm';

class PulseExporter {
    constructor() {
        this.oAuth2Client = null;
        this.isSyncing = false;
        this.getLicenseTier = () => "Silver";
    }

    /**
     * Initializes the Google OAuth2 client using credentials from DB
     */
    async init() {
        if (this.getLicenseTier() !== 'Diamond') {
            return;
        }
        const db = database.getDb();
        const clientId = db.prepare("SELECT value FROM app_settings WHERE key = 'google_client_id'").get()?.value;
        const clientSecret = db.prepare("SELECT value FROM app_settings WHERE key = 'google_client_secret'").get()?.value;
        const redirectUri = 'http://localhost:3004/google-callback';

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
            SELECT id, name, class_name, parent_phone 
            FROM students 
            WHERE parent_phone IS NOT NULL AND parent_phone != ''
        `).all();

        const feeSettingsRow = db.prepare("SELECT value FROM app_settings WHERE key = 'fee_settings'").get();
        const feeSettings    = feeSettingsRow ? JSON.parse(feeSettingsRow.value) : {};

        const data = {
            schoolName,
            termConfig,
            feeSettings,
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

            // Get latest fee status from Phase 5 table
            const fees = db.prepare(`
                SELECT total_billed, total_paid, status, next_due_date
                FROM student_fees
                WHERE student_id = ? AND academic_session = ? AND term = ?
            `).get(student.id, termConfig?.academic_session, termConfig?.term) || {
                total_billed: 0,
                total_paid: 0,
                status: 'unpaid',
                next_due_date: ''
            };

            data.parents[phone].students.push({
                id: student.id,
                name: student.name,
                class_name: student.class_name,
                fee_details: {
                    billed: fees.total_billed,
                    paid: fees.total_paid,
                    balance: fees.total_billed - fees.total_paid,
                    status: fees.status,
                    dueDate: fees.next_due_date
                },
                results,
                attendance
            });
        }

        return JSON.stringify(data);
    }

    /**
     * Exports the encrypted cache and full database backup to Google Drive
     */

    /**
     * Ensures the Nexus folder architecture exists in Google Drive
     * Returns a map of folder names to their Drive IDs
     */
    async ensureFolderArchitecture(drive) {
        // Helper to find or create a folder
        const getOrCreateFolder = async (name, parentId = null) => {
            const query = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false` + 
                          (parentId ? ` and '${parentId}' in parents` : ` and 'root' in parents`);
            
            const response = await drive.files.list({ q: query, fields: 'files(id)' });
            
            if (response.data.files.length > 0) {
                return response.data.files[0].id;
            } else {
                const resource = {
                    name: name,
                    mimeType: 'application/vnd.google-apps.folder'
                };
                if (parentId) resource.parents = [parentId];
                
                const created = await drive.files.create({
                    resource,
                    fields: 'id'
                });
                return created.data.id;
            }
        };

        const db = database.getDb();
        const schoolNameRow = db.prepare("SELECT value FROM app_settings WHERE key = 'school_name'").get();
        const schoolName = schoolNameRow?.value || "Nexus School";

        const rootId = await getOrCreateFolder('Nexus School OS');
        const schoolId = await getOrCreateFolder(schoolName, rootId);
        
        const folders = {
            root: rootId,
            school: schoolId,
            backups: await getOrCreateFolder('Backups', schoolId),
            cache: await getOrCreateFolder('Cache', schoolId),
            knowledge: await getOrCreateFolder('Knowledge Base', schoolId),
            exports: await getOrCreateFolder('Exports', schoolId),
            inbox: await getOrCreateFolder('Pulse Inbox Archive', schoolId)
        };
        
        return folders;
    }

    /**
     * Exports the encrypted cache and full database backup to Google Drive
     */
    async syncToDrive() {
        if (this.getLicenseTier() !== 'Diamond') {
            console.warn("[Pulse Exporter] Sync aborted: Diamond tier required. Current tier:", this.getLicenseTier());
            return;
        }
        if (!this.oAuth2Client || this.isSyncing) return;
        this.isSyncing = true;

        try {
            // 1. Sync the Pulse Cache (for the WhatsApp Bot)
            const cache = this.generateCache();
            const key = this.getOrCreateSecurityKey();
            const encryptedData = this.encrypt(cache, key);

            const drive = google.drive({ version: 'v3', auth: this.oAuth2Client });

            // Ensure Diamond folder architecture
            const folders = await this.ensureFolderArchitecture(drive);

            const response = await drive.files.list({
                q: `name = 'pulse_cache.enc' and '${folders.cache}' in parents and trashed = false`,
                fields: 'files(id)',
            });

            const media = { mimeType: 'text/plain', body: encryptedData };

            if (response.data.files.length > 0) {
                await drive.files.update({ fileId: response.data.files[0].id, media });
                console.log("[Pulse Exporter] Cache Sync Successful.");
            } else {
                await drive.files.create({
                    resource: { name: 'pulse_cache.enc', mimeType: 'text/plain', parents: [folders.cache] },
                    media,
                    fields: 'id',
                });
                console.log("[Pulse Exporter] Cache Sync Successful (Created).");
            }

            // 2. Perform Full Database Backup (Sovereign Shield Requirement)
            await this.backupDatabaseToDrive(drive, key, folders);

        } catch (err) {
            console.error("[Pulse Exporter] Sync Failed:", err);

            // ── Classify the error so the UI shows an actionable message ─────────
            let errorMessage;
            const status = err.code ?? err.status ?? err.response?.status;
            const reason = err.errors?.[0]?.reason ?? '';

            if (status === 403 || reason === 'forbidden' || reason === 'accessNotConfigured') {
                errorMessage = "Google Drive API is disabled or access was denied. Enable the Drive API in your Google Cloud Console and re-authorise.";
            } else if (status === 401 || err.code === 'invalid_grant') {
                errorMessage = "Google authorisation expired. Re-link your Google account in the Nexus Pulse settings.";
            } else if (!this.oAuth2Client) {
                errorMessage = "Google Drive not configured. Add your Client ID and Secret in the Pulse settings.";
            } else {
                errorMessage = `Sync Failed: ${err.message || 'Unknown Error'}`;
            }

            if (this.onSyncError) this.onSyncError(errorMessage);
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Encrypts and uploads the raw nexus.sqlite file to Google Drive
     */
    async backupDatabaseToDrive(drive, key, folders) {
        try {
            // Resolve the live DB path dynamically from the open connection
            // instead of using a hardcoded __dirname-relative path that breaks
            // in production where the DB lives in Electron's userData directory.
            const { database } = require('@nexus/engine');
            const dbPath = database.getDb().name;
            if (!fs.existsSync(dbPath)) {
                console.warn('[Pulse Exporter] DB backup skipped: file not found at', dbPath);
                return;
            }

            const dbContent = fs.readFileSync(dbPath);
            // Encrypt the base64 string of the binary DB
            const encrypted = this.encrypt(dbContent.toString('base64'), key);

            const fileName = `nexus_backup_${new Date().toISOString().split('T')[0]}.enc`;

            // Check if backup for today already exists to avoid clutter
            const existing = await drive.files.list({
                q: `name = '${fileName}' and '${folders.backups}' in parents and trashed = false`,
                fields: 'files(id)',
            });

            if (existing.data.files.length > 0) {
                await drive.files.update({ fileId: existing.data.files[0].id, media: { body: encrypted } });
            } else {
                await drive.files.create({
                    resource: { name: fileName, mimeType: 'text/plain', parents: [folders.backups] },
                    media: { body: encrypted },
                    fields: 'id',
                });
            }
            console.log(`[Pulse Exporter] Full DB Backup successful: ${fileName}`);
        } catch (err) {
            console.error("[Pulse Exporter] DB Backup failed:", err);
        }
    }

    /**
     * Start periodic sync (e.g., every 30 minutes)
     */
    startPeriodicSync(intervalMs = 30 * 60 * 1000) {
        if (this.getLicenseTier() !== 'Diamond') {
            console.warn("[Pulse Exporter] Periodic sync aborted: Diamond tier required.");
            return;
        }
        setInterval(() => this.syncToDrive(), intervalMs);
        this.syncToDrive();
    }
}

module.exports = new PulseExporter();
