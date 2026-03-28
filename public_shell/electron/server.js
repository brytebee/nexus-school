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

    // Notify Main Process
    eventEmitter.emit('handshake-success', req.body);

    const payloadObj = {
        status: "MARRIED",
        message: `Welcome to the ecosystem, ${teacher_name}.`,
        school_config: app.locals.school_config || {
            name: "Grace Academy",
            primary_color: "#800000",
            modules: ["grading", "attendance"]
        },
        students: [], // [Prompt 3 Stub] Will be populated from SQLite filtered by teacher_id
        server_timestamp: new Date().toISOString()
    };

    const jsonString = JSON.stringify(payloadObj);

    // PM Rule: Gzip if > 500 students to prevent Heat Spikes on the mobile side
    // Stubbing length check — teacher-scoped students populated in Prompt 3
    if (false) {
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
        res.status(200).json(payloadObj);
    }
});

// The "Day 2" Sync Endpoint
app.post('/sync', (req, res) => {
    const events = req.body.events || [];

    console.log(`[Sync] Received ${events.length} events from connected device.`);

    // Forward events to main.js via EventEmitter (main.js then forwards to the UI window)
    eventEmitter.emit('sync-events', events);

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
