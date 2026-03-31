const express = require('express');
const app = express();
const address = require('address');
const fs = require('fs');
const csv = require('csv-parser');

const EventEmitter = require('events');
const eventEmitter = new EventEmitter();

const database = require('./database');

app.use(express.json());

// ─── Prompt 2: The CSV Matrix Parser ─────────────────────────────────────────
// Parses a phase-8 CSV with Teacher_ID, Teacher_Name, Teacher_Phone, and
// pipe-delimited Subjects. Inserts securely into SQLite via prepared statements.
function handleCSVUpload(filePath, callback) {
    const rows = [];

    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('error', (err) => {
            console.error('[CSV] Stream error:', err);
            if (callback) callback(0, err.message);
        })
        .on('end', () => {
            let db;
            try {
                db = database.getDb();
            } catch (e) {
                console.error('[CSV] Database not initialized. Aborting import.', e);
                if (callback) callback(0, 'DB not initialized');
                return;
            }

            // Prepare parameterized statements — no raw interpolation, SQL injection-proof
            const upsertTeacher = db.prepare(`
                INSERT INTO teachers (id, name, phone)
                VALUES (@id, @name, @phone)
                ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone
            `);

            const upsertAllocation = db.prepare(`
                INSERT OR IGNORE INTO teacher_allocations (teacher_id, class_name, subject)
                VALUES (@teacher_id, @class_name, @subject)
            `);

            const upsertStudent = db.prepare(`
                INSERT INTO students (id, name, class_name)
                VALUES (@id, @name, @class_name)
                ON CONFLICT(id) DO UPDATE SET name=excluded.name, class_name=excluded.class_name
            `);

            // Wrap all inserts in a single transaction for speed + atomicity
            const runImport = db.transaction((rows) => {
                let studentCount = 0;
                let teacherIds = new Set();
                let allocationCount = 0;

                for (const row of rows) {
                    const studentId    = (row['Student_ID']    || row['ID'] || '').trim();
                    const firstName    = (row['First_Name']    || '').trim();
                    const lastName     = (row['Last_Name']     || '').trim();
                    const className    = (row['Class']         || '').trim();
                    const teacherId    = (row['Teacher_ID']    || '').trim();
                    const teacherName  = (row['Teacher_Name']  || '').trim();
                    const teacherPhone = (row['Teacher_Phone'] || '').trim();
                    const subjectsRaw  = (row['Subjects']      || '').trim();

                    // Skip rows missing critical fields
                    if (!studentId || !firstName || !className || !teacherId) {
                        console.warn(`[CSV] Skipping incomplete row: Student_ID=${studentId}`);
                        continue;
                    }

                    // 1. Upsert teacher (only once per unique teacher ID)
                    if (!teacherIds.has(teacherId)) {
                        upsertTeacher.run({ id: teacherId, name: teacherName, phone: teacherPhone });
                        teacherIds.add(teacherId);
                    }

                    // 2. Upsert teacher_allocations for each pipe-delimited subject
                    const subjects = subjectsRaw
                        ? subjectsRaw.split('|').map(s => s.trim()).filter(Boolean)
                        : ['General'];
                    for (const subject of subjects) {
                        upsertAllocation.run({ teacher_id: teacherId, class_name: className, subject });
                        allocationCount++;
                    }

                    // 3. Upsert student
                    upsertStudent.run({
                        id: studentId,
                        name: `${firstName} ${lastName}`.trim(),
                        class_name: className
                    });
                    studentCount++;
                }

                return { studentCount, teacherCount: teacherIds.size, allocationCount };
            });

            try {
                const result = runImport(rows);
                console.log(`[CSV] ✅ Import complete — ${result.studentCount} students, ${result.teacherCount} teachers, ${result.allocationCount} allocations.`);
                if (callback) callback(result.studentCount, null, result);
            } catch (err) {
                console.error('[CSV] ❌ Transaction failed:', err.message);
                if (callback) callback(0, err.message);
            }
        });
}
// ─────────────────────────────────────────────────────────────────────────────

// The "Day 1" Handshake Endpoint
app.post('/handshake', (req, res) => {
    const { device_id, teacher_name, public_key, thermal_status } = req.body;

    console.log(`[Handshake] Received identity from ${teacher_name} (${device_id})`);

    let db;
    try {
        db = database.getDb();
    } catch (e) {
        return res.status(500).json({ error: "Database not initialized" });
    }

    // Lookup teacher by name (case-insensitive) to ensure robust matching
    const teacher = db.prepare('SELECT id, name FROM teachers WHERE name = ? COLLATE NOCASE LIMIT 1').get(teacher_name);

    if (!teacher) {
        console.warn(`[Handshake] Teacher not found: ${teacher_name}`);
        return res.status(404).json({ error: "Teacher not found in the vault." });
    }

    // Notify Main Process
    eventEmitter.emit('handshake-success', req.body);

    // Fetch targeted students via JOIN on teacher_allocations
    // This creates row-per-student-per-subject matching the Android Room expectation (Prompt 4)
    const students = db.prepare(`
        SELECT s.id, s.name, s.class_name, a.subject 
        FROM students s
        JOIN teacher_allocations a ON s.class_name = a.class_name
        WHERE a.teacher_id = ?
    `).all(teacher.id);

    const payloadObj = {
        status: "MARRIED",
        message: `Welcome to the ecosystem, ${teacher.name}.`,
        school_config: app.locals.school_config || {
            name: "Grace Academy",
            primary_color: "#800000",
            modules: ["grading", "attendance"]
        },
        students: students,
        server_timestamp: new Date().toISOString()
    };

    const jsonString = JSON.stringify(payloadObj);

    // PM Rule: Gzip if > 500 students to prevent Heat Spikes on the mobile side
    // For testing/QA, let's keep the threshold tight or test dynamically, 
    // but the prompt specifies chunk/gzip if > 500.
    if (students.length > 500) {
        console.log(`[Eco-Mode] Payload > 500 targeted students (${students.length}). Gzipping for ${device_id}...`);
        const zlib = require('zlib');
        zlib.gzip(jsonString, (err, buffer) => {
            if (!err) {
                res.setHeader('Content-Encoding', 'gzip');
                res.setHeader('Content-Type', 'application/json');
                res.status(200).send(buffer);
            } else {
                res.status(500).send("Compression error");
            }
        });
    } else {
        console.log(`[Handshake] Sending ${students.length} targeted student records to ${device_id}`);
        res.status(200).json(payloadObj);
    }
});

// The "Day 2" Sync Endpoint
app.post('/sync', (req, res) => {
    const { device_id, teacher_name, signature, events } = req.body || {};
    const eventsArray = events || [];

    console.log(`[Sync] Received ${eventsArray.length} signed events from device: ${device_id || 'UNKNOWN'}`);
    if (signature) {
        console.log(`[Sync] ECDSA Signature Attached: ${signature.substring(0, 30)}...`);
    }

    let db;
    try {
        db = database.getDb();
    } catch (e) {
        console.error("[Sync] DB not ready.");
        return res.status(500).json({ error: "Database not initialized" });
    }

    // Attempt to lookup teacher_id
    let teacherId = "UNKNOWN_TEACHER";
    if (teacher_name) {
        const teacher = db.prepare('SELECT id FROM teachers WHERE name = ? COLLATE NOCASE LIMIT 1').get(teacher_name);
        if (teacher) teacherId = teacher.id;
    }

    // Process Ledger insertions in a single atomic transaction
    const insertLog = db.prepare('INSERT INTO sync_logs (event_id, device_id, teacher_id, payload) VALUES (?, ?, ?, ?)');
    const upsertRecord = db.prepare(`
        INSERT OR REPLACE INTO student_records 
        (student_id, subject, assessment, score, breakdown, teacher_id) 
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    let successfullyInserted = 0;

    const processSyncTransaction = db.transaction(() => {
        for (const evt of eventsArray) {
            try {
                // 1. Audit Trail
                insertLog.run(evt.event_id, device_id || 'UNKNOWN', teacherId, JSON.stringify(evt));

                // 2. Ledger Upsert
                if (evt.event_type === "UPDATE_GRADE") {
                    const p = JSON.parse(evt.payload);
                    const breakdownStr = p.breakdown ? JSON.stringify(p.breakdown) : "{}";
                    
                    upsertRecord.run(
                        p.student_id, 
                        p.subject || 'General', 
                        p.assessment || 'CA1', 
                        p.score, 
                        breakdownStr, 
                        teacherId
                    );
                    successfullyInserted++;
                }
            } catch (err) {
                console.error(`[Sync] Failed to process event ${evt.event_id}:`, err.message);
            }
        }
    });

    try {
        processSyncTransaction();
        console.log(`[Sync] Successfully upserted ${successfullyInserted} grade records into Ledger.`);
    } catch (err) {
        console.error("[Sync] Transaction failed:", err);
    }

    // Forward enriched events to main.js via EventEmitter
    eventEmitter.emit('sync-events', { teacher_name: teacher_name || "A Teacher", events: eventsArray, count: successfullyInserted });

    res.status(200).json({ status: 'ACK' });
});

function startServer(port = 3000) {
    app.listen(port, () => {
        const ip = address.ip();
        console.log(`[Nexus Server] Listening at http://${ip}:${port}`);
    });
    return eventEmitter;
}

function setSchoolConfig(config) {
    app.locals.school_config = config;
}

function clearData() {
    try {
        const db = database.getDb();
        db.exec('DELETE FROM sync_logs; DELETE FROM teacher_allocations; DELETE FROM teachers; DELETE FROM students;');
        console.log('[CSV] All database tables cleared.');
    } catch (e) {
        console.warn('[CSV] Could not clear DB (not yet initialized):', e.message);
    }
}

module.exports = { startServer, setSchoolConfig, handleCSVUpload, clearData };
