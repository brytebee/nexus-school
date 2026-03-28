const { app } = require('electron');
const path = require('path');
const database = require('./database');

app.setName('NexusSchoolOS');

app.whenReady().then(() => {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'nexus.sqlite');

    console.log(`[Verify DB] Initializing database at: ${dbPath}`);
    const db = database.init(dbPath);

    const tablesQuery = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
    const tables = tablesQuery.all().map(t => t.name);

    console.log(`\n[Verify DB] Found Tables:`);
    tables.forEach(t => console.log(` - ${t}`));

    if (tables.includes('students') && tables.includes('teachers') && tables.includes('teacher_allocations') && tables.includes('sync_logs')) {
        console.log(`\n[SUCCESS] All 4 required tables successfully verified.`);
    } else {
        console.error(`\n[ERROR] Missing tables. Found: ${tables.join(', ')}`);
    }

    db.close();
    app.quit();
});
