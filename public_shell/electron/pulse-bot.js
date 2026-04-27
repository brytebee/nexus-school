const { Client, LocalAuth } = require('whatsapp-web.js');
const { database } = require('../../private_engine');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

let client = null;
let mainWindowRef = null;
let isReady = false;
let qrCodeData = null;

function initPulseBot(mainWindow) {
    mainWindowRef = mainWindow;
}

function sendStatus(status, data = null) {
    if (mainWindowRef) {
        mainWindowRef.webContents.send('pulse-status', { status, data });
    }
}

async function startPulse() {
    if (client) {
        console.log('[Pulse Bot] Client already exists. Returning current state.');
        if (qrCodeData && !isReady) {
            sendStatus('qr', qrCodeData);
        } else if (isReady) {
            sendStatus('ready');
        }
        return;
    }

    console.log('[Pulse Bot] Starting...');
    sendStatus('starting');

    try {
        const authPath = path.join(os.homedir(), '.nexus_pulse_auth');
        client = new Client({
            authStrategy: new LocalAuth({ dataPath: authPath }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            }
        });

        client.on('qr', async (qr) => {
            console.log('[Pulse Bot] QR RECEIVED');
            try {
                const qrDataUrl = await QRCode.toDataURL(qr);
                qrCodeData = qrDataUrl;
                isReady = false;
                sendStatus('qr', qrDataUrl);
            } catch (err) {
                console.error('[Pulse Bot] Failed to generate QR data URL:', err);
            }
        });

        client.on('ready', () => {
            console.log('[Pulse Bot] Client is ready!');
            isReady = true;
            qrCodeData = null;
            sendStatus('ready');
        });

        client.on('authenticated', () => {
            console.log('[Pulse Bot] Authenticated');
            sendStatus('authenticated');
        });

        client.on('auth_failure', msg => {
            console.error('[Pulse Bot] Authentication failure', msg);
            sendStatus('error', 'Authentication failed');
            destroyPulse();
        });

        client.on('disconnected', (reason) => {
            console.log('[Pulse Bot] Disconnected:', reason);
            sendStatus('disconnected');
            destroyPulse();
        });

        client.on('message', async (msg) => {
            try {
                await handleMessage(msg);
            } catch (err) {
                console.error('[Pulse Bot] Error handling message:', err);
            }
        });

        await client.initialize();
    } catch (err) {
        console.error('[Pulse Bot] Failed to initialize:', err);
        sendStatus('error', err.message);
        destroyPulse();
    }
}

async function destroyPulse() {
    if (client) {
        try {
            await client.destroy();
        } catch (e) {
            console.error('[Pulse Bot] Error destroying client', e);
        }
        client = null;
    }
    isReady = false;
    qrCodeData = null;
    sendStatus('disconnected');
}

async function handleMessage(msg) {
    if (!msg.from || !msg.body) return;
    
    // Ignore group messages or status updates
    if (msg.from.includes('@g.us') || msg.from === 'status@broadcast') return;

    const phoneNumberRaw = msg.from.split('@')[0];
    const normalizedPhone = phoneNumberRaw.replace('+', '');
    const text = msg.body.trim().toUpperCase();

    if (text.startsWith('RESULT') || text.startsWith('ATTENDANCE')) {
        const db = database.getDb();
        
        // Find students associated with this phone number
        const students = db.prepare("SELECT id, name, class_name FROM students WHERE parent_phone LIKE ?").all(`%${normalizedPhone}`);
        
        if (!students || students.length === 0) {
            await msg.reply("Sorry, we couldn't find any students linked to this phone number. Please contact the school administrator.");
            return;
        }

        if (text.startsWith('RESULT')) {
            const termConfig = db.prepare("SELECT * FROM school_term_config WHERE id = 1").get();
            if (!termConfig) {
                 await msg.reply("School configuration is missing. Please contact administrator.");
                 return;
            }

            let responseText = `*Results for ${termConfig.term} (${termConfig.academic_session})*\n\n`;

            for (const student of students) {
                responseText += `👤 *${student.name}* (${student.class_name})\n`;
                
                const records = db.prepare("SELECT subject, score FROM student_records WHERE student_id = ? AND academic_session = ? AND term = ?").all(student.id, termConfig.academic_session, termConfig.term);
                
                if (records.length === 0) {
                    responseText += `No results available yet.\n`;
                } else {
                    let total = 0;
                    records.forEach(r => {
                        responseText += `- ${r.subject}: ${r.score}%\n`;
                        total += r.score;
                    });
                    const avg = (total / records.length).toFixed(1);
                    responseText += `*Average:* ${avg}%\n`;
                }
                responseText += `\n`;
            }
            
            await msg.reply(responseText);
            
        } else if (text.startsWith('ATTENDANCE')) {
            const termConfig = db.prepare("SELECT * FROM school_term_config WHERE id = 1").get();
            let responseText = `*Attendance for ${termConfig.term} (${termConfig.academic_session})*\n\n`;

            for (const student of students) {
                const att = db.prepare("SELECT COUNT(*) as count FROM daily_attendance WHERE student_id = ? AND term = ? AND academic_session = ? AND status = 'Present'").get(student.id, termConfig.term, termConfig.academic_session);
                const totalAtt = db.prepare("SELECT COUNT(*) as count FROM daily_attendance WHERE student_id = ? AND term = ? AND academic_session = ?").get(student.id, termConfig.term, termConfig.academic_session);
                
                if (totalAtt.count === 0) {
                    responseText += `👤 *${student.name}:* No attendance records found.\n`;
                } else {
                    responseText += `👤 *${student.name}:* Present ${att.count} out of ${totalAtt.count} days.\n`;
                }
            }
            await msg.reply(responseText);
        }
    } else {
        await msg.reply("Welcome to Nexus Pulse 🎓\n\nReply with:\n*RESULT* - to view current term results\n*ATTENDANCE* - to view attendance records");
    }
}

module.exports = {
    initPulseBot,
    startPulse,
    destroyPulse,
    getPulseStatus: () => {
        if (!client) return { status: 'disconnected' };
        if (isReady) return { status: 'ready' };
        if (qrCodeData) return { status: 'qr', data: qrCodeData };
        return { status: 'starting' };
    }
};
