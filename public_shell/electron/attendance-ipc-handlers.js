// ══════════════════════════════════════════════════════════════════════════════
// Nexus School OS — Attendance IPC Handlers (V2.3)
// Dual-Layer Attendance & Truancy Detection (Diamond Tier)
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

const { ipcMain } = require('electron');

module.exports = function registerAttendanceHandlers(database, enqueueWhatsApp, getLicenseTier) {
    const db = () => database.getDb();

    function isDiamond() {
        const tier = typeof getLicenseTier === 'function' ? getLicenseTier() : 'Silver';
        return tier === 'Diamond';
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Read a system_settings value by key, with JSON parse fallback.
     */
    function getSetting(key) {
        const row = db().prepare("SELECT value FROM system_settings WHERE key = ?").get(key);
        if (!row) return null;
        try { return JSON.parse(row.value); } catch { return row.value; }
    }

    /**
     * Central Guardian Shield alert dispatcher.
     * Reads the truancy_escalation_flow config and fires notifications
     * only when the student's flag_count crosses a configured threshold.
     *
     * @param {object} student  - { id, name, class_name, parent_phone }
     * @param {string} type     - 'daily_absence' | 'subject_absence'
     * @param {object} context  - { date, subject_name? }
     */
    function guardianShieldAlert(student, type, context) {
        const database = db();
        const escalationFlow = getSetting('truancy_escalation_flow') || [];

        // Upsert truancy_flags row
        database.prepare(`
            INSERT INTO truancy_flags (student_id, flag_count, last_flagged, escalation_step)
            VALUES (?, 1, ?, 0)
            ON CONFLICT(student_id) DO UPDATE SET
                flag_count = flag_count + 1,
                last_flagged = excluded.last_flagged
        `).run(student.id, context.date);

        const flagRow = database.prepare("SELECT flag_count, escalation_step FROM truancy_flags WHERE student_id = ?").get(student.id);
        if (!flagRow) return;

        const { flag_count, escalation_step } = flagRow;

        // Walk the ladder to find if this flag_count triggers the next step
        for (const step of escalationFlow) {
            if (flag_count >= step.trigger_after && escalation_step < step.step) {
                // Escalate
                database.prepare("UPDATE truancy_flags SET escalation_step = ? WHERE student_id = ?").run(step.step, student.id);

                if (step.channel === 'whatsapp' && step.notify === 'parent') {
                    const subjectNote = type === 'subject_absence' && context.subject_name
                        ? ` during *${context.subject_name}*`
                        : '';
                    const msg = `🚨 *Nexus Truancy Alert*\n\nDear Parent/Guardian, *${student.name}* (${student.class_name}) has been flagged for truancy${subjectNote} on ${context.date}.\n\nThis is flag #${flag_count}. Please contact the school immediately.`;

                    if (typeof enqueueWhatsApp === 'function' && student.parent_phone) {
                        enqueueWhatsApp(student.parent_phone, msg, student.id);
                    }
                }
                // In-app notifications for form_teacher / principal go to a notification table
                // (rendered in the Truancy Radar dashboard)
                if (step.channel === 'in-app') {
                    console.log(`[Guardian Shield] Step ${step.step}: Notify ${step.notify} about ${student.name} (flag #${flag_count})`);
                }
                break; // Only trigger one step per flag increment
            }
        }
    }

    // ── Settings ──────────────────────────────────────────────────────────────

    ipcMain.handle('attendance:get-settings', () => {
        const keys = ['enable_daily_attendance', 'enable_subject_attendance', 'truancy_escalation_flow'];
        const settings = {};
        for (const key of keys) settings[key] = getSetting(key);
        return { ok: true, settings };
    });

    ipcMain.handle('attendance:save-settings', (event, patch) => {
        const stmt = db().prepare("INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
        for (const [key, value] of Object.entries(patch)) {
            const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
            stmt.run(key, valStr);
        }
        return { ok: true };
    });

    // ── Subject Attendance ────────────────────────────────────────────────────

    ipcMain.handle('attendance:save-subject-attendance', (event, { records, date, subject_name, class_name, session, term, marked_by }) => {
        if (!isDiamond()) {
            return { ok: false, error: 'Diamond Tier Required' };
        }
        const database = db();

        const insertRaw = database.prepare(`
            INSERT INTO subject_attendance (student_id, subject_name, class_name, date, status, marked_by)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(student_id, subject_name, date) DO UPDATE SET status = excluded.status, marked_by = excluded.marked_by
        `);

        const upsertAgg = database.prepare(`
            INSERT INTO subject_attendance_agg (student_id, subject_name, academic_session, term, total_classes, classes_attended)
            VALUES (?, ?, ?, ?, 1, ?)
            ON CONFLICT(student_id, subject_name, academic_session, term) DO UPDATE SET
                total_classes = total_classes + 1,
                classes_attended = classes_attended + excluded.classes_attended
        `);

        // Fetch student details for Guardian Shield
        const studentIds = records.map(r => r.student_id);
        const placeholders = studentIds.map(() => '?').join(',');
        const students = database.prepare(`SELECT id, name, class_name, parent_phone FROM students WHERE id IN (${placeholders})`).all(...studentIds);
        const studentMap = Object.fromEntries(students.map(s => [s.id, s]));

        const tx = database.transaction((recs) => {
            for (const r of recs) {
                insertRaw.run(r.student_id, subject_name, class_name, date, r.status, marked_by || 'Teacher');
                const attended = (r.status === 'present' || r.status === 'late') ? 1 : 0;
                upsertAgg.run(r.student_id, subject_name, session, term, attended);

                // Fire Guardian Shield if absent
                if (r.status === 'absent') {
                    const student = studentMap[r.student_id];
                    if (student) guardianShieldAlert(student, 'subject_absence', { date, subject_name });
                }
            }
        });

        try {
            tx(records);
            return { ok: true };
        } catch (err) {
            console.error('[Attendance] save-subject-attendance error:', err);
            return { ok: false, error: err.message };
        }
    });

    ipcMain.handle('attendance:get-subject-attendance', (event, { class_name, subject_name, date }) => {
        if (!isDiamond()) {
            return { ok: true, rows: [] };
        }
        try {
            const rows = db().prepare(`
                SELECT sa.student_id, s.name as student_name, sa.status, sa.marked_by
                FROM subject_attendance sa
                JOIN students s ON s.id = sa.student_id
                WHERE sa.class_name = ? AND sa.subject_name = ? AND sa.date = ?
                ORDER BY s.name ASC
            `).all(class_name, subject_name, date);
            return { ok: true, rows };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    });

    ipcMain.handle('attendance:get-subject-agg', (event, { student_id, session, term }) => {
        if (!isDiamond()) {
            return { ok: true, rows: [] };
        }
        try {
            const rows = db().prepare(`
                SELECT subject_name, total_classes, classes_attended,
                       ROUND(CAST(classes_attended AS REAL) / NULLIF(total_classes, 0) * 100) as pct
                FROM subject_attendance_agg
                WHERE student_id = ? AND academic_session = ? AND term = ?
                ORDER BY subject_name ASC
            `).all(student_id, session, term);
            return { ok: true, rows };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    });

    // ── Truancy Radar ─────────────────────────────────────────────────────────

    ipcMain.handle('attendance:get-truancy-flags', (event, { class_name } = {}) => {
        if (!isDiamond()) {
            return { ok: true, rows: [] };
        }
        try {
            const query = class_name
                ? `SELECT tf.*, s.name as student_name, s.class_name FROM truancy_flags tf JOIN students s ON s.id = tf.student_id WHERE s.class_name = ? ORDER BY tf.flag_count DESC`
                : `SELECT tf.*, s.name as student_name, s.class_name FROM truancy_flags tf JOIN students s ON s.id = tf.student_id ORDER BY tf.flag_count DESC`;
            const rows = class_name
                ? db().prepare(query).all(class_name)
                : db().prepare(query).all();
            return { ok: true, rows };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    });

    ipcMain.handle('attendance:get-truancy-report', (event, { date, class_name }) => {
        // Returns students marked present (daily) but absent for ≥1 subject on the same date
        if (!isDiamond()) {
            return { ok: true, rows: [] };
        }
        try {
            const rows = db().prepare(`
                SELECT DISTINCT s.id, s.name, s.class_name,
                    da.status as daily_status,
                    GROUP_CONCAT(sa.subject_name, ', ') as skipped_subjects,
                    tf.flag_count, tf.escalation_step
                FROM daily_attendance da
                JOIN students s ON s.id = da.student_id
                JOIN subject_attendance sa ON sa.student_id = da.student_id AND sa.date = da.date AND sa.status = 'absent'
                LEFT JOIN truancy_flags tf ON tf.student_id = da.student_id
                WHERE da.date = ?
                  AND da.status IN ('Present', 'Late')
                  ${class_name ? "AND da.class_name = ?" : ""}
                GROUP BY s.id
                ORDER BY tf.flag_count DESC
            `).all(...(class_name ? [date, class_name] : [date]));
            return { ok: true, rows };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    });

    ipcMain.handle('attendance:dismiss-truancy-flag', (event, { student_id }) => {
        if (!isDiamond()) {
            return { ok: false, error: 'Diamond Tier Required' };
        }
        try {
            db().prepare("UPDATE truancy_flags SET flag_count = 0, escalation_step = 0, last_flagged = NULL WHERE student_id = ?").run(student_id);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    });
};
