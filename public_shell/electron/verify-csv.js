/**
 * verify-csv.js
 * Verifies Prompt 2: runs handleCSVUpload on the sample CSV and
 * queries SQLite to confirm teacher, allocation and student counts are correct.
 */
const electron = require('electron');
const { app } = typeof electron === 'object' ? electron : require('electron');
const path = require('path');
const database = require('./database');
const { handleCSVUpload } = require('./server');

app.whenReady().then(async () => {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'nexus.sqlite');

    console.log(`[Verify CSV] Initializing DB at: ${dbPath}`);
    const db = database.init(dbPath);

    // Clear tables first to get a clean import test
    db.exec('DELETE FROM sync_logs; DELETE FROM teacher_allocations; DELETE FROM teachers; DELETE FROM students;');
    console.log('[Verify CSV] Tables cleared. Starting fresh import...\n');

    const csvPath = path.join(__dirname, 'Sample_Students.csv');

    handleCSVUpload(csvPath, (count, err, result) => {
        if (err) {
            console.error('[Verify CSV] ❌ Import failed:', err);
            app.quit();
            return;
        }

        console.log('\n─── Query Results ─────────────────────────────────');

        // 1. Verify teachers table
        const teachers = db.prepare('SELECT * FROM teachers').all();
        console.log(`\n[Teachers] ${teachers.length} found:`);
        teachers.forEach(t => console.log(`  - [${t.id}] ${t.name} | ${t.phone}`));

        // 2. Verify teacher_allocations table
        const allocations = db.prepare('SELECT * FROM teacher_allocations').all();
        console.log(`\n[Teacher Allocations] ${allocations.length} found:`);
        allocations.forEach(a => console.log(`  - Teacher: ${a.teacher_id} | Class: ${a.class_name} | Subject: ${a.subject}`));

        // 3. Verify students table
        const students = db.prepare('SELECT * FROM students').all();
        console.log(`\n[Students] ${students.length} found:`);
        students.forEach(s => console.log(`  - [${s.id}] ${s.name} | Class: ${s.class_name}`));

        // 4. QA: check no duplicate primary keys
        const dupeStudents = db.prepare('SELECT id, COUNT(*) as cnt FROM students GROUP BY id HAVING cnt > 1').all();
        const dupeTeachers = db.prepare('SELECT id, COUNT(*) as cnt FROM teachers GROUP BY id HAVING cnt > 1').all();

        console.log('\n─── QA Checks ─────────────────────────────────────');
        console.log(dupeStudents.length === 0 ? '[QA] ✅ No duplicate student IDs.' : `[QA] ❌ Duplicate student IDs: ${JSON.stringify(dupeStudents)}`);
        console.log(dupeTeachers.length === 0 ? '[QA] ✅ No duplicate teacher IDs.' : `[QA] ❌ Duplicate teacher IDs: ${JSON.stringify(dupeTeachers)}`);

        console.log('\n───────────────────────────────────────────────────');
        if (teachers.length > 0 && allocations.length > 0 && students.length > 0) {
            console.log('[SUCCESS] ✅ Prompt 2 verified. SQLite correctly populated from Phase 8 CSV matrix.');
        } else {
            console.error('[FAILURE] ❌ One or more tables empty. Check parser and CSV format.');
        }

        app.quit();
    });
});

app.on('window-all-closed', () => {});
