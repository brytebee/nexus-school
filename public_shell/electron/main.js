const { app, BrowserWindow, ipcMain, shell, Menu, dialog, nativeImage } = require("electron");

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const {
  startServer,
  setSchoolConfig,
  handleCSVUpload,
  clearData,
} = require("./server");
const database = require("./database");
const address = require("address");

// Set app name BEFORE createWindow so Menu.buildFromTemplate picks it up correctly
app.setName("NexusSchoolOS");

if (!app) {
  console.error(
    "[CRITICAL] Electron 'app' is undefined. Ensure you are running with 'electron .'",
  );
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
  signature: "",
};
let identityFilePath = "";
let qrPayload = null;

// ── ALL ipcMain.handle registrations (ONCE at module scope) ──────────────────

ipcMain.handle("get-identity", () => {
  return identityPacket;
});

ipcMain.handle("get-teachers", () => {
  try {
    const db = database.getDb();
    return db
      .prepare("SELECT id, name, phone, email FROM teachers ORDER BY name ASC")
      .all();
  } catch (err) {
    console.error("Failed to fetch teachers:", err);
    return [];
  }
});

// ── Teacher Identity QR Authority (single source of truth) ───────────────────
ipcMain.handle("set-teacher", (event, { id, name }) => {
  if (!qrPayload) return false;
  qrPayload.teacher_id = id;
  qrPayload.teacher_name = name;
  if (mainWindow) {
    mainWindow.webContents.send("qr-payload", qrPayload);
    console.log(`[Electron] QR updated for teacher: ${name} [${id}]`);
  }
  return true;
});

// ── DB Stats (for wizard gate logic) ─────────────────────────────────────────
ipcMain.handle("get-db-stats", () => {
  try {
    const db = database.getDb();
    const teachers = db.prepare("SELECT COUNT(*) as c FROM teachers").get().c;
    const students = db.prepare("SELECT COUNT(*) as c FROM students").get().c;
    return { teachers, students };
  } catch (err) {
    return { teachers: 0, students: 0 };
  }
});

// ── Form-based Teacher Entry ──────────────────────────────────────────────────
// allocations: [{ class_name: 'JSS1', subjects: ['Mathematics', 'English'] }, ...]
ipcMain.handle(
  "add-teacher-form",
  (event, { id, name, phone, email, allocations }) => {
    try {
      const db = database.getDb();
      db.prepare(
        "INSERT INTO teachers (id, name, phone, email) VALUES (@id, @name, @phone, @email) ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone, email=excluded.email",
      ).run({ id, name, phone: phone || "", email: email || "" });

      if (allocations && allocations.length > 0) {
        const insertAlloc = db.prepare(
          "INSERT OR IGNORE INTO teacher_allocations (teacher_id, class_name, subject) VALUES (?, ?, ?)",
        );
        const insertAll = db.transaction(() => {
          for (const alloc of allocations) {
            const { class_name, subjects = [] } = alloc;
            if (!class_name) continue;
            for (const subject of subjects) {
              if (subject.trim())
                insertAlloc.run(id, class_name, subject.trim());
            }
          }
        });
        insertAll();
      }
      console.log(
        `[Form] Teacher added: ${name} with ${(allocations || []).length} class allocations.`,
      );
      return { ok: true, id };
    } catch (err) {
      console.error("[Form] Failed to add teacher:", err);
      return { ok: false, error: err.message };
    }
  },
);

// ── Form-based Teacher Update (Admin only) ────────────────────────────────────
ipcMain.handle("update-teacher", (event, { id, name, phone, email }) => {
  try {
    const db = database.getDb();
    db.prepare(
      "UPDATE teachers SET name=@name, phone=@phone, email=@email WHERE id=@id",
    ).run({ id, name, phone: phone || "", email: email || "" });
    console.log(`[Form] Teacher updated: ${name}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Form-based Student Entry (mobile adds/edits; this is a DB stub) ───────────
ipcMain.handle("add-student-form", (event, { id, name, class_name }) => {
  try {
    const db = database.getDb();
    db.prepare(
      "INSERT INTO students (id, name, class_name) VALUES (@id, @name, @class_name) ON CONFLICT(id) DO UPDATE SET name=excluded.name, class_name=excluded.class_name",
    ).run({ id, name, class_name });
    console.log(`[Form] Student added: ${name}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Directory: Get All Teachers (with allocations) ──────────────────────────
ipcMain.handle("get-all-teachers", () => {
  try {
    const db = database.getDb();
    const teachers = db
      .prepare("SELECT * FROM teachers ORDER BY name ASC")
      .all();
    const getAllocs = db.prepare(
      "SELECT class_name, subject FROM teacher_allocations WHERE teacher_id = ? ORDER BY class_name, subject",
    );
    for (const t of teachers) {
      t.allocations = getAllocs.all(t.id);
    }
    return teachers;
  } catch (err) {
    console.error("[Dir] Failed to get teachers:", err);
    return [];
  }
});

// ── Directory: Get All Students ─────────────────────────────────────────
ipcMain.handle("get-all-students", () => {
  try {
    const db = database.getDb();
    // Deduplicate: student may appear once per subject in Android DB,
    // but desktop DB stores them once — use DISTINCT on id to be safe.
    return db
      .prepare(
        "SELECT DISTINCT id, name, class_name FROM students ORDER BY class_name ASC, name ASC",
      )
      .all();
  } catch (err) {
    console.error("[Dir] Failed to get students:", err);
    return [];
  }
});

// ── Directory: Delete Teacher ─────────────────────────────────────────────────
ipcMain.handle("delete-teacher", (event, { id }) => {
  try {
    const db = database.getDb();
    db.transaction(() => {
      db.prepare("DELETE FROM teacher_allocations WHERE teacher_id = ?").run(
        id,
      );
      db.prepare("DELETE FROM teachers WHERE id = ?").run(id);
    })();
    console.log(`[Dir] Teacher ${id} deleted.`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Directory: Delete Student ─────────────────────────────────────────────────
ipcMain.handle("delete-student", (event, { id }) => {
  try {
    const db = database.getDb();
    db.prepare("DELETE FROM students WHERE id = ?").run(id);
    console.log(`[Dir] Student ${id} deleted.`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("save-identity", (event, newIdentity) => {
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
    mainWindow.webContents.send("qr-payload", qrPayload);
  }
  return true;
});

console.log("[Electron] Registering generate-reports handler...");
// ── Window Controls (for custom frameless titlebar) ───────────────────────────
ipcMain.on("win-minimize", () => {
  if (mainWindow) mainWindow.minimize();
});
ipcMain.on("win-maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on("win-close", () => {
  if (mainWindow) mainWindow.close();
});
ipcMain.handle("get-platform", () => process.platform);

ipcMain.handle("reset-app-data", async () => {
  console.log("[Electron] Resetting app data...");

  // 1. Reset identity packet to default
  identityPacket = {
    name: "Green Valley High",
    themePrimary: "#1A237E",
    themeSecondary: "#00E5FF",
    logoBase64: null,
    address: "",
    motto: "",
    signature: "",
  };

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
    mainWindow.webContents.send("qr-payload", qrPayload);
  }

  return true;
});
ipcMain.handle("generate-reports", async (event, payload) => {
  console.log(
    "[Electron] generate-reports handler FIRED. Payload keys:",
    payload ? Object.keys(payload) : "null",
  );
  const { identity, students } = payload || {};
  try {
    const primary = identity.themePrimary || "#1A237E";

    const dateStr = new Date().toLocaleDateString("en-NG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    function getGrade(score) {
      if (score >= 70) return { letter: "A", bg: "#e8f5e9", color: "#2e7d32" };
      if (score >= 55) return { letter: "B", bg: "#e3f2fd", color: "#1565c0" };
      if (score >= 40) return { letter: "C", bg: "#fff8e1", color: "#f57f17" };
      return { letter: "F", bg: "#fde8e8", color: "#c62828" };
    }

    const pages = students
      .map((student) => {
        const bd = student.breakdown || {};
        const g = getGrade(student.total || 0);
        return `
            <div class="report-page">
                <div class="rh">
                    ${logoHtml}
                    <div class="ri">
                        <div class="rn">${identity.name || "Nexus Academy"}</div>
                        <div class="ra">${identity.address || ""}</div>
                        <div class="rm">${identity.motto ? '"' + identity.motto + '"' : ""}</div>
                    </div>
                    <div class="rt"><strong>Report Card</strong><br>${dateStr}</div>
                </div>
                <div class="sb">
                    <div><div class="sn">${student.name || student.id}</div><div class="si">ID: ${student.id}</div></div>
                    <div class="sc">${student.class_name || "N/A"}</div>
                </div>
                <p class="lbl">Grade Breakdown</p>
                <table><thead><tr><th>Assessment</th><th>Max</th><th>Score</th></tr></thead><tbody>
                    <tr><td>1st Continuous Assessment (CA1)</td><td>10</td><td><b>${bd.CA1 ?? "—"}</b></td></tr>
                    <tr><td>2nd Continuous Assessment (CA2)</td><td>10</td><td><b>${bd.CA2 ?? "—"}</b></td></tr>
                    <tr><td>Terminal Examination</td><td>80</td><td><b>${bd.Exam ?? "—"}</b></td></tr>
                </tbody></table>
                <div class="sum">
                    <div class="sc2"><div class="v">${student.total ?? "—"}</div><div class="l">Total</div></div>
                    <div class="sc2"><div class="v">${student.total ? student.total + "%" : "—"}</div><div class="l">Percentage</div></div>
                    <div class="sc2"><div class="v"><span style="background:${g.bg};color:${g.color};padding:4px 12px;border-radius:20px;font-weight:700;">${student.total ? g.letter : "—"}</span></div><div class="l">Grade</div></div>
                </div>
                <div class="ft">
                    <span style="color:#bbb;font-size:10px">Generated by Nexus School OS • ${dateStr}</span>
                    <div style="text-align:center"><div style="font-size:14px;font-weight:700;color:${primary};border-top:1px solid #ccc;padding-top:8px">${identity.signature || "Principal"}</div><div style="font-size:10px;color:#999">Principal / Head Teacher</div></div>
                </div>
            </div>`;
      })
      .join("\n");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Report Cards — ${identity.name || "Nexus Academy"}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#fff;}
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
.sc{background:rgba(0,0,0,.15);padding:6px 14px;border-radius:20px;font-size:13px}
.lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;margin:14px 0 8px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
th{background:#f0f2ff;color:${primary};font-size:11px;font-weight:700;text-transform:uppercase;padding:10px 14px;text-align:left;border-bottom:2px solid ${primary}}
td{padding:10px 14px;border-bottom:1px solid #eee;font-size:13px}
.sum{display:flex;gap:12px;margin-bottom:20px}
.sc2{flex:1;border:2px solid ${primary};border-radius:12px;padding:14px;text-align:center}
.v{font-size:26px;font-weight:700;color:${primary}}.l{font-size:11px;color:#999;margin-top:4px;text-transform:uppercase}
.ft{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;padding-top:16px;border-top:1px solid #eee}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>${pages}</body></html>`;

    const desktopPath = app.getPath("desktop");
    const outFolder = path.join(desktopPath, "NexusReports");
    if (!fs.existsSync(outFolder)) fs.mkdirSync(outFolder, { recursive: true });

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const outPath = path.join(
      outFolder,
      `Master_Batched_Results_${timestamp}.pdf`,
    );

    // Phase 1: Headless Batched PDF Generation
    await new Promise((resolve, reject) => {
      let hiddenWindow = new BrowserWindow({
        show: false,
        webPreferences: { offscreen: true },
      });

      hiddenWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
      );

      hiddenWindow.webContents.on("did-finish-load", async () => {
        try {
          const pdfBuffer = await hiddenWindow.webContents.printToPDF({
            printBackground: true,
            pageSize: "A4",
          });
          fs.writeFileSync(outPath, pdfBuffer);
          console.log(
            `[Electron] Master PDF securely generated at: ${outPath}`,
          );
          hiddenWindow.close();
          hiddenWindow = null;
          resolve();
        } catch (e) {
          hiddenWindow.close();
          reject(e);
        }
      });
    });

    // Phase 2: The Neutral Ground (Premium Plan Extraction)
    // Feature gate: Only extract single HTMLs for Easy WhatsApp sharing if school has premium plan.
    if (
      identity.premiumPlan === true ||
      identity.premiumPlan === "true" ||
      identity.isPremium
    ) {
      const extractFolder = path.join(outFolder, "Digital_Copies_PREMIUM");
      if (!fs.existsSync(extractFolder))
        fs.mkdirSync(extractFolder, { recursive: true });

      // Generate single HTML page per student
      students.forEach((student) => {
        const singlePageHtml = html.replace(
          "${pages}",
          pages.split("</div></div></div>")[students.indexOf(student)] +
            "</div></div></div>",
        );
        // Extremely lightweight template specifically for this student
        const studentSafeName = (student.name || student.id).replace(
          /[^a-z0-9]/gi,
          "_",
        );
        const singlePath = path.join(
          extractFolder,
          `${studentSafeName}_Report.html`,
        );

        // Hacky injection of just their page inside a wrapper
        const cleanSingleHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${student.name} Report</title>
                <style>${html.split("<style>")[1].split("</style>")[0]}
                body { padding: 0 !important; background: #e0e0e0; display:flex; justify-content:center; align-items:center; min-height: 100vh;}
                .report-page { background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.1); margin: 20px 0; border-radius: 8px;}
                </style></head><body>
                ${pages.split('<div class="report-page">')[students.indexOf(student) + 1].split('<div class="ft">')[0]}<div class="ft">${pages.split('<div class="report-page">')[students.indexOf(student) + 1].split('<div class="ft">')[1].split("</div></div>")[0]}</div></div></div>
                </body></html>`;

        fs.writeFileSync(singlePath, cleanSingleHtml, "utf-8");
      });
      console.log(
        `[Electron] Generated ${students.length} premium digital envelopes.`,
      );
    }

    await shell.openPath(outFolder);

    return { success: true, path: outPath, folder: outFolder };
  } catch (err) {
    console.error("[Electron] PDF generation failed:", err);
    throw err;
  }
});

// ─────────────────────────────────────────────────────────────────────────────

function createWindow() {
  // ── Initialize Persistence First ──────────────────────────────────────────
  try {
    const userDataPath = app.getPath("userData");
    identityFilePath = path.join(userDataPath, "identity.json");

    // Initialize SQLite Database
    const dbPath = path.join(userDataPath, "nexus.sqlite");
    database.init(dbPath);

    if (fs.existsSync(identityFilePath)) {
      const data = fs.readFileSync(identityFilePath, "utf-8");
      identityPacket = JSON.parse(data);
    } else {
      fs.writeFileSync(
        identityFilePath,
        JSON.stringify(identityPacket, null, 2),
      );
    }
  } catch (err) {
    console.error("Failed to load/save identity.json or initialize DB", err);
  }

  // Remove default native menu bar
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "NexusSchoolOS",
        submenu: [
          {
            label: "About",
            click: () => {
              dialog.showMessageBox({
                title: "About NexusSchoolOS",
                message: "NexusSchoolOS is a school management system.",
                buttons: ["OK"],
              });
            },
          },
          {
            label: "Quit",
            click: () => {
              app.quit();
            },
          },
        ],
      },
    ]),
  );

  // Load Icon
  const iconPath = path.join(__dirname, "assets", "icon.png");
  let appIcon = null;
  if (fs.existsSync(iconPath)) {
    appIcon = nativeImage.createFromPath(iconPath);
    if (process.platform === "darwin" && app.dock) {
      app.dock.setIcon(appIcon);
    }
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    // On macOS: keep native traffic lights inset in the top-left corner
    // On Windows/Linux: fully frameless, we draw custom chrome in HTML
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 14, y: 16 },
    frame: process.platform !== "darwin", // frameless on Windows/Linux
    backgroundColor: "#0A0E2E",
  });

  // (app name already set at module scope)
  mainWindow.loadFile("index.html");

  // Start the Handshake Server
  const port = 3000;
  const server = startServer(port);

  // ── License Enforcement Engine ─────────────────────────────────────
  let licenseStatus = { locked: false, message: "" };

  try {
    const userDataPath = app.getPath("userData");
    const licensePath = path.join(userDataPath, "license.nexus");

    // 1. Hardcoded Nexus Public Key (In reality, Public Key only ships with app)
    // For demonstration, we persist a keypair dynamically to sign a dummy token.
    const keyPairPath = path.join(userDataPath, "demo_keypair.json");
    let publicKey, privateKey;
    if (fs.existsSync(keyPairPath)) {
      const keys = JSON.parse(fs.readFileSync(keyPairPath, "utf-8"));
      publicKey = crypto.createPublicKey(keys.publicKey);
      privateKey = crypto.createPrivateKey(keys.privateKey);
    } else {
      const kp = crypto.generateKeyPairSync("ed25519");
      publicKey = kp.publicKey;
      privateKey = kp.privateKey;
      fs.writeFileSync(
        keyPairPath,
        JSON.stringify({
          publicKey: publicKey.export({ type: "spki", format: "pem" }),
          privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
        }),
      );
    }

    if (!fs.existsSync(licensePath)) {
      // Generate a dummy license expiring in 4 months (1 typical term)
      const expiresAt = Date.now() + 4 * 30 * 24 * 60 * 60 * 1000;
      const payload = {
        tier: "Gold",
        school_id: "PREMIUM_ACADEMY_001",
        expires_at: expiresAt,
      };
      const payloadStr = JSON.stringify(payload);
      const signature = crypto.sign(null, Buffer.from(payloadStr), privateKey);

      const licenseFile = {
        payload: payloadStr,
        signature: signature.toString("hex"),
      };
      fs.writeFileSync(licensePath, JSON.stringify(licenseFile, null, 2));
      console.log(
        "[License Engine] Generated dummy terminal license ending in 4 months.",
      );
    }

    // 2. Verify License
    const licenseDisk = JSON.parse(fs.readFileSync(licensePath, "utf-8"));
    const isValidSignature = crypto.verify(
      null,
      Buffer.from(licenseDisk.payload),
      publicKey,
      Buffer.from(licenseDisk.signature, "hex"),
    );

    if (!isValidSignature) {
      licenseStatus = {
        locked: true,
        message:
          "Tampering Detected. Cryptographic signature invalid. Contact Administrator.",
      };
    } else {
      const payloadDecoded = JSON.parse(licenseDisk.payload);
      if (Date.now() > payloadDecoded.expires_at) {
        licenseStatus = {
          locked: true,
          message: `License Expired. Your ${payloadDecoded.tier} tier has lapsed. Contact Administrator.`,
        };
      } else {
        console.log(
          `[License Engine] Valid ${payloadDecoded.tier} License. Access Granted.`,
        );
      }
    }
  } catch (e) {
    console.error("[License Engine] Failure:", e);
    licenseStatus = {
      locked: true,
      message: "License vault corrupted. Re-install required.",
    };
  }



  // Build QR Payload
  qrPayload = {
    sid: "PREMIUM_ACADEMY_001",
    ip: address.ip(),
    port: port,
    handshake_key: "TEMP_RSA_PUBLIC_KEY_STRING",
    config: identityPacket,
  };

  setSchoolConfig(qrPayload.config);

  // Handle Handshake Events
  server.on("handshake-success", (data) => {
    if (mainWindow) {
      mainWindow.webContents.send("handshake-complete", data);
      console.log(`[Electron] Handshake successful for ${data.teacher_name}`);
    }
  });

  // Handle Sync Events
  server.on("sync-events", (data) => {
    if (mainWindow) {
      mainWindow.webContents.send("sync-update", data);
      console.log(`[Electron] Forwarded sync events to UI.`);
    }
  });

  // Fallback: also send on did-finish-load
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("qr-payload", qrPayload);
    mainWindow.webContents.send("license-status", licenseStatus);
  });

  ipcMain.on("ui-ready", () => {
    mainWindow.webContents.send("qr-payload", qrPayload);
    mainWindow.webContents.send("license-status", licenseStatus);
    console.log("[Electron] Payload sent to UI");
  });

  ipcMain.on("process-csv", (event, filePath) => {
    handleCSVUpload(filePath, (count) => {
      event.reply("csv-loaded", count);
    });
  });

  console.log(
    "QR Payload:",
    JSON.stringify(
      {
        ...qrPayload,
        config: {
          ...qrPayload.config,
          logoBase64: qrPayload.config.logoBase64 ? "BASE64_Omitted" : null,
        },
      },
      null,
      2,
    ),
  );
}

if (app) {
  app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
} else {
  console.warn(
    "[Nexus] Running in non-electron environment. UI will not be launched.",
  );
}
