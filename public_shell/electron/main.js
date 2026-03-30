const { app, BrowserWindow, ipcMain, shell } = require('electron');

const path = require('path');
const fs = require('fs');
const { startServer, setSchoolConfig, handleCSVUpload, clearData } = require('./server');
const database = require('./database');
const address = require('address');

if (!app) {
    console.error("[CRITICAL] Electron 'app' is undefined. Ensure you are running with 'electron .'");
}

let mainWindow;

// ── State at module scope so IPC handlers can safely access it ──
let identityPacket = {
    name: "Green Valley High",
    themePrimary: "#1A237E",
    themeSecondary: "#00E5FF",
    logoBase64: null,
    address: "",
    motto: "",
    signature: ""
};
let identityFilePath = "";
let qrPayload = null;

// ── ALL ipcMain.handle registrations (ONCE at module scope) ──────────────────

ipcMain.handle('get-identity', () => {
    return identityPacket;
});

ipcMain.handle('save-identity', (event, newIdentity) => {
    identityPacket = { ...identityPacket, ...newIdentity };
    try {
        fs.writeFileSync(identityFilePath, JSON.stringify(identityPacket, null, 2));
        console.log("[Electron] Identity saved locally.");
    } catch (err) {
        console.error("Failed to save identity", err);
    }
    if (qrPayload) {
        qrPayload.config = identityPacket;
        setSchoolConfig(qrPayload.config);
    }
    if (mainWindow) {
        mainWindow.webContents.send('qr-payload', qrPayload);
    }
    return true;
});

console.log('[Electron] Registering generate-reports handler...');
ipcMain.handle('reset-app-data', async () => {
    console.log("[Electron] Resetting app data...");
    
    // 1. Reset identity packet to default
    identityPacket = {
        name: "Green Valley High",
        themePrimary: "#1A237E",
        themeSecondary: "#00E5FF",
        logoBase64: null,
        address: "",
        motto: "",
        signature: ""
    }

    // 2. Clear identity.json
    try {
        if (identityFilePath && fs.existsSync(identityFilePath)) {
            fs.unlinkSync(identityFilePath);
            console.log("[Electron] identity.json deleted.");
        }
    } catch (err) {
        console.error("Failed to delete identity.json", err);
    }

    // 3. Clear server data (students)
    clearData();

    // 4. Update QR Payload
    if (qrPayload) {
        qrPayload.config = identityPacket;
        setSchoolConfig(qrPayload.config);
    }

    // 5. Notify UI
    if (mainWindow) {
        mainWindow.webContents.send('qr-payload', qrPayload);
    }

    return true;
});
ipcMain.handle('generate-reports', async (event, payload) => {
    console.log('[Electron] generate-reports handler FIRED. Payload keys:', payload ? Object.keys(payload) : 'null');
    const { identity, students } = payload || {};
    try {
        const primary = identity.themePrimary || '#1A237E';

        const dateStr = new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });

        function getGrade(score) {
            if (score >= 70) return { letter: 'A', bg: '#e8f5e9', color: '#2e7d32' };
            if (score >= 55) return { letter: 'B', bg: '#e3f2fd', color: '#1565c0' };
            if (score >= 40) return { letter: 'C', bg: '#fff8e1', color: '#f57f17' };
            return { letter: 'F', bg: '#fde8e8', color: '#c62828' };
        }

        const pages = students.map(student => {
            const bd = student.breakdown || {};
            const g = getGrade(student.total || 0);
            return `
            <div class="report-page">
                <div class="rh">
                    ${logoHtml}
                    <div class="ri">
                        <div class="rn">${identity.name || 'Nexus Academy'}</div>
                        <div class="ra">${identity.address || ''}</div>
                        <div class="rm">${identity.motto ? '"' + identity.motto + '"' : ''}</div>
                    </div>
                    <div class="rt"><strong>Report Card</strong><br>${dateStr}</div>
                </div>
                <div class="sb">
                    <div><div class="sn">${student.name || student.id}</div><div class="si">ID: ${student.id}</div></div>
                    <div class="sc">${student.class_name || 'N/A'}</div>
                </div>
                <p class="lbl">Grade Breakdown</p>
                <table><thead><tr><th>Assessment</th><th>Max</th><th>Score</th></tr></thead><tbody>
                    <tr><td>1st Continuous Assessment (CA1)</td><td>10</td><td><b>${bd.CA1 ?? '—'}</b></td></tr>
                    <tr><td>2nd Continuous Assessment (CA2)</td><td>10</td><td><b>${bd.CA2 ?? '—'}</b></td></tr>
                    <tr><td>Terminal Examination</td><td>80</td><td><b>${bd.Exam ?? '—'}</b></td></tr>
                </tbody></table>
                <div class="sum">
                    <div class="sc2"><div class="v">${student.total ?? '—'}</div><div class="l">Total</div></div>
                    <div class="sc2"><div class="v">${student.total ? student.total + '%' : '—'}</div><div class="l">Percentage</div></div>
                    <div class="sc2"><div class="v"><span style="background:${g.bg};color:${g.color};padding:4px 12px;border-radius:20px;font-weight:700;">${student.total ? g.letter : '—'}</span></div><div class="l">Grade</div></div>
                </div>
                <div class="ft">
                    <span style="color:#bbb;font-size:10px">Generated by Nexus School OS • ${dateStr}</span>
                    <div style="text-align:center"><div style="font-size:14px;font-weight:700;color:${primary};border-top:1px solid #ccc;padding-top:8px">${identity.signature || 'Principal'}</div><div style="font-size:10px;color:#999">Principal / Head Teacher</div></div>
                </div>
            </div>`;
        }).join('\n');

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Report Cards — ${identity.name || 'Nexus Academy'}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif}
.report-page{width:210mm;min-height:297mm;padding:16mm;page-break-after:always;display:flex;flex-direction:column}
.report-page:last-child{page-break-after:auto}
.rh{display:flex;align-items:center;gap:16px;padding-bottom:14px;border-bottom:3px solid ${primary}}
.school-logo{width:72px;height:72px;border-radius:12px;object-fit:contain}
.logo-placeholder{width:72px;height:72px;border-radius:12px;background:${primary};color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;flex-shrink:0}
.ri{flex:1}.rn{font-size:18px;font-weight:700;color:${primary};text-transform:uppercase;letter-spacing:1px}
.ra,.rm{font-size:11px;color:#888;margin-top:2px}.rm{font-style:italic}
.rt{text-align:right;font-size:11px}.rt strong{display:block;font-size:14px;font-weight:700;color:${primary}}
.sb{background:${primary};color:#fff;border-radius:12px;padding:14px 20px;margin:18px 0;display:flex;justify-content:space-between;align-items:center}
.sn{font-size:20px;font-weight:700}.si{font-size:12px;opacity:.7;margin-top:3px}
.sc{background:rgba(255,255,255,.15);padding:6px 14px;border-radius:20px;font-size:13px}
.lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;margin:14px 0 8px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
th{background:#f0f2ff;color:${primary};font-size:11px;font-weight:700;text-transform:uppercase;padding:10px 14px;text-align:left;border-bottom:2px solid ${primary}}
td{padding:10px 14px;border-bottom:1px solid #eee;font-size:13px}
.sum{display:flex;gap:12px;margin-bottom:20px}
.sc2{flex:1;border:2px solid ${primary};border-radius:12px;padding:14px;text-align:center}
.v{font-size:26px;font-weight:700;color:${primary}}.l{font-size:11px;color:#999;margin-top:4px;text-transform:uppercase}
.ft{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;padding-top:16px;border-top:1px solid #eee}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>${pages}
<script>window.onload=()=>{window.print()}<\/script>
</body></html>`;

        const desktopPath = app.getPath('desktop');
        const outFolder = path.join(desktopPath, 'NexusReports');
        if (!fs.existsSync(outFolder)) fs.mkdirSync(outFolder, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const outPath = path.join(outFolder, `ReportCards_${timestamp}.html`);
        fs.writeFileSync(outPath, html, 'utf-8');

        console.log(`[Electron] Report HTML saved to: ${outPath}`);
        await shell.openPath(outPath);

        return { success: true, path: outPath, folder: outFolder };

    } catch (err) {
        console.error('[Electron] Report generation failed:', err);
        throw err;
    }
});

// ─────────────────────────────────────────────────────────────────────────────


function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        titleBarStyle: 'hidden',
        backgroundColor: '#0A0E2E'
    });

    mainWindow.loadFile('index.html');
    app.setName('NexusSchoolOS');

    // Start the Handshake Server
    const port = 3000;
    const server = startServer(port);

    // Load IdentityPacket from disk
    try {
        const userDataPath = app.getPath('userData');
        identityFilePath = path.join(userDataPath, 'identity.json');
        
        // Initialize SQLite Database
        const dbPath = path.join(userDataPath, 'nexus.sqlite');
        database.init(dbPath);

        if (fs.existsSync(identityFilePath)) {
            const data = fs.readFileSync(identityFilePath, 'utf-8');
            identityPacket = JSON.parse(data);
        } else {
            fs.writeFileSync(identityFilePath, JSON.stringify(identityPacket, null, 2));
        }
    } catch (err) {
        console.error("Failed to load/save identity.json or initialize DB", err);
    }

    // Build QR Payload
    qrPayload = {
        sid: "PREMIUM_ACADEMY_001",
        ip: address.ip(),
        port: port,
        handshake_key: "TEMP_RSA_PUBLIC_KEY_STRING",
        config: identityPacket
    };

    setSchoolConfig(qrPayload.config);

    // Handle Handshake Events
    server.on('handshake-success', (data) => {
        if (mainWindow) {
            mainWindow.webContents.send('handshake-complete', data);
            console.log(`[Electron] Handshake successful for ${data.teacher_name}`);
        }
    });

    // Handle Sync Events
    server.on('sync-events', (data) => {
        if (mainWindow) {
            mainWindow.webContents.send('sync-update', data);
            console.log(`[Electron] Forwarded sync events to UI.`);
        }
    });

    // Send initial QR payload when UI signals ready
    ipcMain.on('ui-ready', () => {
        mainWindow.webContents.send('qr-payload', qrPayload);
        console.log("[Electron] Payload sent to UI");
    });

    ipcMain.on('process-csv', (event, filePath) => {
        handleCSVUpload(filePath, (count) => {
            event.reply('csv-loaded', count);
        });
    });

    // Fallback: also send on did-finish-load
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('qr-payload', qrPayload);
    });

    console.log("QR Payload:", JSON.stringify({
        ...qrPayload,
        config: { ...qrPayload.config, logoBase64: qrPayload.config.logoBase64 ? 'BASE64_Omitted' : null }
    }, null, 2));
}

if (app) {
    app.whenReady().then(() => {
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
} else {
    console.warn("[Nexus] Running in non-electron environment. UI will not be launched.");
}
