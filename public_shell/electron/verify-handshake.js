const { app } = require('electron');
const path = require('path');
const http = require('http');
const database = require('./database');
const { startServer, handleCSVUpload } = require('./server');

app.setName('NexusSchoolOS');

app.whenReady().then(() => {
    // 1. Initialize Database
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'nexus.sqlite');
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
            app.quit();
            return;
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
                const containsForeignStudents = responseObj.students.some(s => s.name === 'Fatima Yusuf'); 
                
                if (responseObj.students.length === 12 && !containsForeignStudents) {
                    console.log('[SUCCESS] ✅ Handshake restricted payload exactly to the targeted matrix.\n');
                } else {
                    console.error('[FAILURE] ❌ Payload incorrectly targeted or empty. Got', responseObj.students.length, '\n');
                }
                
                app.quit();
            });
        });
        
        req.on('error', (e) => {
            console.error('[Verify] Request error:', e.message);
            app.quit();
        });
        
        req.write(payload);
        req.end();
    });
});
