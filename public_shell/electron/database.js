const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let db;

function init(dbPath) {
    if (db) return db;

    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Initialize better-sqlite3
    db = new Database(dbPath, { verbose: console.log });

    // Enable Write-Ahead Logging for better concurrency handling during sync
    db.pragma('journal_mode = WAL');

    console.log(`[Database] SQLite connected at ${dbPath}`);

    // Architect and execute schema migration
    db.exec(`
        -- Table 1: Teachers
        CREATE TABLE IF NOT EXISTS teachers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT
        );

        -- Table 2: Teacher Allocations (Many-to-Many junction)
        CREATE TABLE IF NOT EXISTS teacher_allocations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id TEXT NOT NULL,
            class_name TEXT NOT NULL,
            subject TEXT NOT NULL,
            UNIQUE(teacher_id, class_name, subject),
            FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
        );

        -- Table 3: Students
        CREATE TABLE IF NOT EXISTS students (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            class_name TEXT NOT NULL
        );

        -- Table 4: Sync Logs (for offline queue resolution and auditing)
        CREATE TABLE IF NOT EXISTS sync_logs (
            event_id TEXT PRIMARY KEY,
            device_id TEXT NOT NULL,
            teacher_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    console.log(`[Database] Core tables (students, teachers, teacher_allocations, sync_logs) verified.`);
    
    return db;
}

function getDb() {
    if (!db) {
        throw new Error("Database not initialized. Call init(dbPath) first.");
    }
    return db;
}

module.exports = { init, getDb };
