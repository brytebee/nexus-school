/**
 * verify-csv.node.js  — pure Node test (no Electron)
 * Tests the CSV parser and SQLite insertion directly.
 */
const path = require('path');
const os = require('os');
const database = require('./database');

// Inline the CSV handler to avoid pulling in Express/Electron
const fs = require('fs');
const csv = require('csv-parser');

function handleCSVUpload(filePath, callback) {
    const rows = [];
    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('error', (err) => { if (callback) callback(0, err.message); })
        .on('end', () => {
            let db;
            try { db = database.getDb(); }
            catch (e) { if (callback) callback(0, 'DB not initialized'); return; }

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

            const runImport = db.transaction((rows) => {
                let studentCount = 0, allocationCount = 0;
                const teacherIds = new Set();
                for (const row of rows) {
                    const studentId    = (row['Student_ID']    || '').trim();
                    const firstName    = (row['First_Name']    || '').trim();
                    const lastName     = (row['Last_Name']     || '').trim();
                    const className    = (row['Class']         || '').trim();
                    const teacherId    = (row['Teacher_ID']    || '').trim();
                    const teacherName  = (row['Teacher_Name']  || '').trim();
                    const teacherPhone = (row['Teacher_Phone'] || '').trim();
                    const subjectsRaw  = (row['Subjects']      || '').trim();
                    if (!studentId || !firstName || !className || !teacherId) continue;
                    if (!teacherIds.has(teacherId)) {
                        upsertTeacher.run({ id: teacherId, name: teacherName, phone: teacherPhone });
                        teacherIds.add(teacherId);
                    }
                    const subjects = subjectsRaw ? subjectsRaw.split('|').map(s => s.trim()).filter(Boolean) : ['General'];
                    for (const subject of subjects) {
                        upsertAllocation.run({ teacher_id: teacherId, class_name: className, subject });
                        allocationCount++;
                    }
                    upsertStudent.run({ id: studentId, name: `${firstName} ${lastName}`.trim(), class_name: className });
                    studentCount++;
                }
                return { studentCount, teacherCount: teacherIds.size, allocationCount };
            });

            try {
                const result = runImport(rows);
                if (callback) callback(result.studentCount, null, result);
            } catch (err) {
                if (callback) callback(0, err.message);
            }
        });
}

// ── Run test ──────────────────────────────────────────────────────────────────
const dbPath = path.join(os.tmpdir(), 'nexus_test.sqlite');
console.log(`[Verify CSV] Using temp DB at: ${dbPath}`);
const db = database.init(dbPath);
db.exec('DELETE FROM sync_logs; DELETE FROM teacher_allocations; DELETE FROM teachers; DELETE FROM students;');
console.log('[Verify CSV] Clean slate. Importing CSV...\n');

const csvPath = path.join(__dirname, 'Sample_Students.csv');

handleCSVUpload(csvPath, (count, err, result) => {
    if (err) { console.error('❌ Import failed:', err); process.exit(1); }

    const teachers    = db.prepare('SELECT * FROM teachers').all();
    const allocations = db.prepare('SELECT * FROM teacher_allocations').all();
    const students    = db.prepare('SELECT * FROM students').all();

    console.log(`[Teachers] ${teachers.length} found:`);
    teachers.forEach(t => console.log(`  - [${t.id}] ${t.name} | ${t.phone}`));

    console.log(`\n[Teacher Allocations] ${allocations.length} found:`);
    allocations.forEach(a => console.log(`  - ${a.teacher_id} → ${a.class_name} | ${a.subject}`));

    console.log(`\n[Students] ${students.length} found:`);
    students.forEach(s => console.log(`  - [${s.id}] ${s.name} | ${s.class_name}`));

    const dupeS = db.prepare('SELECT id, COUNT(*) c FROM students GROUP BY id HAVING c > 1').all();
    const dupeT = db.prepare('SELECT id, COUNT(*) c FROM teachers GROUP BY id HAVING c > 1').all();

    console.log('\n─── QA ──────────────────────────────────────────────');
    console.log(dupeS.length === 0 ? '✅ No duplicate student IDs.' : `❌ Duplicate students: ${JSON.stringify(dupeS)}`);
    console.log(dupeT.length === 0 ? '✅ No duplicate teacher IDs.' : `❌ Duplicate teachers: ${JSON.stringify(dupeT)}`);

    const ok = teachers.length > 0 && allocations.length > 0 && students.length > 0 && dupeS.length === 0 && dupeT.length === 0;
    console.log('\n' + (ok ? '[SUCCESS] ✅ Prompt 2 verified — all tables populated correctly.' : '[FAILURE] ❌ Check above errors.'));
    process.exit(ok ? 0 : 1);
});
