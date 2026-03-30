/**
 * verify-handshake.node.js
 * Verifies Prompt 3: Targeted Handshake via pure Node.
 */
const path = require('path');
const os = require('os');
const database = require('./database');
const { startServer, handleCSVUpload } = require('./server');
const http = require('http');

// 1. Initialize Temp DB
const dbPath = path.join(os.tmpdir(), 'nexus_test.sqlite');
console.log(`[Verify Node] Initializing Temp DB at: ${dbPath}`);
database.init(dbPath);
const db = database.getDb();

// Clear and re-populate the real DB for testing
db.exec('DELETE FROM sync_logs; DELETE FROM teacher_allocations; DELETE FROM teachers; DELETE FROM students;');

// 2. Start Server
startServer(3001); // use 3001 to avoid conflicts

const csvPath = path.join(__dirname, 'Sample_Students.csv');
handleCSVUpload(csvPath, (count, err) => {
    if (err || count === 0) {
        console.error('[Verify] CSV Import failed. Cannot test handshake.', err);
        process.exit(1);
    }
    
    console.log('[Verify] Database populated. Issuing targeted handshake for "Mr. Adebayo Okonkwo"...\n');
    
    const payload = JSON.stringify({
        device_id: "TEST_DEVICE",
        teacher_name: "Mr. Adebayo Okonkwo",
        public_key: "test_key",
        thermal_status: "cool"
    });
    
    const req = http.request({
        hostname: 'localhost',
        port: 3001,
        path: '/handshake',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': payload.length
        }
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            const responseObj = JSON.parse(data);
            console.log('─── Response Payload ──────────────────────────────');
            console.log(`Status: ${responseObj.status}`);
            console.log(`Message: ${responseObj.message}`);
            console.log(`Targeted Students: ${responseObj.students.length} rows`);
            
            responseObj.students.forEach(s => {
                console.log(`  - ${s.name} (${s.class_name}) -> Subject: ${s.subject}`);
            });
            
            console.log('\n─── QA Validation ─────────────────────────────────');
            // Every student in JSS1 (5), JSS2 (4), SS1 (3) = 12 total students.
            // Mr. Adebayo teaches Math and English (2 subjects) to all these classes.
            // So we expect 12 * 2 = 24 targeted payload rows.
            
            if (responseObj.students.length === 24) {
                console.log('[SUCCESS] ✅ Handshake restricted payload perfectly to the 24 targeted matrix rows.');
                process.exit(0);
            } else {
                console.error(`[FAILURE] ❌ Payload incorrectly targeted or empty. Expected 24, Got ${responseObj.students.length}`);
                process.exit(1);
            }
        });
    });
    
    req.on('error', (e) => {
        console.error('[Verify] Request error:', e.message);
        process.exit(1);
    });
    
    req.write(payload);
    req.end();
});
