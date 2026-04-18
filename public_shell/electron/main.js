const { app, BrowserWindow, ipcMain, shell, Menu, dialog, nativeImage, clipboard, globalShortcut } = require("electron");

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Handlebars = require("handlebars");
const { database, server, reports } = require("@nexus/engine");
const { startServer, setSchoolConfig, handleCSVUpload, clearData } = server;
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

// ── Form-based Teacher Update — profile only (legacy stub) ────────────────────────────
ipcMain.handle("update-teacher", (event, { id, name, phone, email }) => {
  try {
    const db = database.getDb();
    db.prepare(
      "UPDATE teachers SET name=@name, phone=@phone, email=@email WHERE id=@id",
    ).run({ id, name, phone: phone || "", email: email || "" });
    console.log(`[Form] Teacher profile updated: ${name}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Full Teacher Update — profile + replace all allocations ────────────────────────────
ipcMain.handle("update-teacher-full", (event, { id, name, phone, email, allocations }) => {
  try {
    const db = database.getDb();
    db.transaction(() => {
      db.prepare(
        "UPDATE teachers SET name=@name, phone=@phone, email=@email WHERE id=@id",
      ).run({ id, name: name || "", phone: phone || "", email: email || "" });
      db.prepare("DELETE FROM teacher_allocations WHERE teacher_id = ?").run(id);
      if (allocations && allocations.length > 0) {
        const ins = db.prepare(
          "INSERT OR IGNORE INTO teacher_allocations (teacher_id, class_name, subject) VALUES (?, ?, ?)",
        );
        for (const alloc of allocations) {
          const { class_name, subjects = [] } = alloc;
          if (!class_name) continue;
          for (const subj of subjects) {
            if (subj.trim()) ins.run(id, class_name, subj.trim());
          }
        }
      }
    })();
    console.log(`[Form] Teacher ${id} fully updated: ${name}, ${(allocations||[]).length} allocation group(s).`);
    return { ok: true };
  } catch (err) {
    console.error('[Form] update-teacher-full failed:', err);
    return { ok: false, error: err.message };
  }
});

// ── Form-based Student Entry (mobile adds/edits; this is a DB stub) ───────────
ipcMain.handle("add-student-form", (event, { id, name, class_name, subjects, reg_no, gender, dob, photo, parent_email, parent_phone, fee_status }) => {
  try {
    const db = database.getDb();
    db.transaction(() => {
      // 1. Upsert Student (with extended V2 profile fields)
      db.prepare(`
        INSERT INTO students (id, name, class_name, reg_no, gender, dob, photo, parent_email, parent_phone, fee_status)
        VALUES (@id, @name, @class_name, @reg_no, @gender, @dob, @photo, @parent_email, @parent_phone, @fee_status)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, class_name=excluded.class_name,
          reg_no=excluded.reg_no, gender=excluded.gender, dob=excluded.dob,
          photo=COALESCE(excluded.photo, photo),
          parent_email=excluded.parent_email, parent_phone=excluded.parent_phone,
          fee_status=excluded.fee_status
      `).run({ id, name, class_name,
        reg_no: reg_no || '', gender: gender || '', dob: dob || '',
        photo: photo || null, parent_email: parent_email || '',
        parent_phone: parent_phone || '', fee_status: fee_status || 'cleared'
      });
      // 2. Refresh subject enrollment
      db.prepare("DELETE FROM student_subjects WHERE student_id = ?").run(id);
      if (subjects && subjects.length > 0) {
        const stmt = db.prepare("INSERT INTO student_subjects (student_id, subject) VALUES (?, ?)");
        for (const subj of subjects) stmt.run(id, subj);
      }
    })();
    console.log(`[Form] Student added: ${name} with ${subjects?.length || 0} subjects`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Form-based Student Update (“Edit” path) ──────────────────────────────────────
ipcMain.handle("update-student", (event, { id, name, class_name, subjects, reg_no, gender, dob, photo, parent_email, parent_phone, fee_status }) => {
  try {
    const db = database.getDb();
    db.transaction(() => {
      // photo only updated when explicitly provided (avoids wiping existing photo on minor edits)
      if (photo !== undefined && photo !== null) {
        db.prepare(`
          UPDATE students SET name=@name, class_name=@class_name,
            reg_no=@reg_no, gender=@gender, dob=@dob, photo=@photo,
            parent_email=@parent_email, parent_phone=@parent_phone,
            fee_status=@fee_status
          WHERE id=@id
        `).run({ id, name, class_name, reg_no: reg_no||'', gender: gender||'', dob: dob||'',
                 photo, parent_email: parent_email||'', parent_phone: parent_phone||'',
                 fee_status: fee_status||'cleared' });
      } else {
        db.prepare(`
          UPDATE students SET name=@name, class_name=@class_name,
            reg_no=@reg_no, gender=@gender, dob=@dob,
            parent_email=@parent_email, parent_phone=@parent_phone,
            fee_status=@fee_status
          WHERE id=@id
        `).run({ id, name, class_name, reg_no: reg_no||'', gender: gender||'', dob: dob||'',
                 parent_email: parent_email||'', parent_phone: parent_phone||'',
                 fee_status: fee_status||'cleared' });
      }
      // Replace subject enrollment
      db.prepare("DELETE FROM student_subjects WHERE student_id = ?").run(id);
      if (subjects && subjects.length > 0) {
        const stmt = db.prepare("INSERT INTO student_subjects (student_id, subject) VALUES (?, ?)");
        for (const subj of subjects) stmt.run(id, subj);
      }
    })();
    console.log(`[Form] Student ${id} updated: ${name}, ${subjects?.length || 0} subjects.`);
    return { ok: true };
  } catch (err) {
    console.error('[Form] update-student failed:', err);
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
    const students = db
      .prepare(
        "SELECT id, name, class_name, reg_no, gender, dob, photo, parent_email, parent_phone, fee_status FROM students ORDER BY class_name ASC, name ASC",
      )
      .all();
    // Attach subject enrollment
    const stmt = db.prepare("SELECT subject FROM student_subjects WHERE student_id = ?");
    for (const student of students) {
      student.subjects = stmt.all(student.id).map(row => row.subject);
    }
    
    return students;
  } catch (err) {
    console.error("[Dir] Failed to get students:", err);
    return [];
  }
});

// ── Directory: Delete Teacher ─────────────────────────────────────────────────
ipcMain.handle("delete-teacher", (event, { id }) => {
  try {
    const db = database.getDb();
    // Purge allocations, attributed records, and audit logs before removing
    // the teacher row itself to avoid orphaned foreign key references.
    db.transaction(() => {
      db.prepare("DELETE FROM teacher_allocations WHERE teacher_id = ?").run(id);
      // Null-out teacher attribution in grade records rather than deleting
      // student data — grades remain intact but lose teacher attribution.
      db.prepare("UPDATE student_records SET teacher_id = NULL WHERE teacher_id = ?").run(id);
      db.prepare("UPDATE sync_logs       SET teacher_id = 'DELETED' WHERE teacher_id = ?").run(id);
      db.prepare("DELETE FROM teachers WHERE id = ?").run(id);
    })();
    console.log(`[Dir] Teacher ${id} and all allocations deleted.`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Directory: Delete Student ─────────────────────────────────────────────────
ipcMain.handle("delete-student", (event, { id }) => {
  try {
    const db = database.getDb();
    // Purge all related rows explicitly so no orphans remain,
    // regardless of whether FK cascade is active on this SQLite build.
    db.transaction(() => {
      db.prepare("DELETE FROM student_subjects  WHERE student_id = ?").run(id);
      db.prepare("DELETE FROM student_records   WHERE student_id = ?").run(id);
      db.prepare("DELETE FROM student_domains   WHERE student_id = ?").run(id);
      db.prepare("DELETE FROM teacher_remarks   WHERE student_id = ?").run(id);
      db.prepare("DELETE FROM students          WHERE id         = ?").run(id);
    })();
    console.log(`[Dir] Student ${id} and all related records deleted.`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── V2: Term Configuration ────────────────────────────────────────────────────
ipcMain.handle("get-term-config", () => {
  try {
    const db = database.getDb();
    return db.prepare("SELECT * FROM school_term_config WHERE id = 1").get() || {};
  } catch (err) {
    return {};
  }
});

ipcMain.handle("save-term-config", (event, config) => {
  try {
    const db = database.getDb();
    db.prepare(`
      INSERT INTO school_term_config (id, academic_session, term, resumption_date, grading_scale, show_position, show_domains, template)
      VALUES (1, @academic_session, @term, @resumption_date, @grading_scale, @show_position, @show_domains, @template)
      ON CONFLICT(id) DO UPDATE SET
        academic_session = excluded.academic_session,
        term = excluded.term,
        resumption_date = excluded.resumption_date,
        grading_scale = excluded.grading_scale,
        show_position = excluded.show_position,
        show_domains = excluded.show_domains,
        template = excluded.template
    `).run({
      academic_session: config.academic_session || "2024/2025",
      term: config.term || "First Term",
      resumption_date: config.resumption_date || "",
      grading_scale: typeof config.grading_scale === "string"
        ? config.grading_scale
        : JSON.stringify(config.grading_scale || []),
      show_position: config.show_position ? 1 : 0,
      show_domains: config.show_domains ? 1 : 0,
      template: config.template || "clean_slate",
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── V2: Query Results (dynamic scope filtering) ───────────────────────────────
ipcMain.handle("query-results", (event, { scope, session, term, class_name, subject, teacher_id, student_id }) => {
  try {
    const db = database.getDb();

    // Build student roster depending on scope
    let students;
    if (scope === "student" && student_id) {
      students = db.prepare("SELECT * FROM students WHERE id = ?").all(student_id);
    } else if (scope === "class" && class_name) {
      students = db.prepare("SELECT * FROM students WHERE class_name = ? ORDER BY name ASC").all(class_name);
    } else if (scope === "teacher" && teacher_id) {
      // Students who are enrolled in at least one of this teacher's allocated subjects.
      // The LEFT JOIN + GROUP BY approach keeps students who have student_subjects rows
      // that match; the HAVING clause filters to only those with ≥1 matching enrollment.
      // Falls back gracefully: if a student has NO rows in student_subjects at all
      // (e.g. imported via CSV before the subject fix), they are still included so
      // report data is never silently suppressed for legacy records.
      students = db.prepare(`
        SELECT DISTINCT s.* FROM students s
        JOIN teacher_allocations a ON s.class_name = a.class_name
        WHERE a.teacher_id = ?
          AND (
            -- Student has explicit subject enrollment that matches this teacher's subject
            EXISTS (
              SELECT 1 FROM student_subjects ss
              WHERE ss.student_id = s.id AND ss.subject = a.subject
            )
            OR
            -- Fallback: student has NO subject rows at all (CSV-imported, pre-fix)
            NOT EXISTS (
              SELECT 1 FROM student_subjects ss2
              WHERE ss2.student_id = s.id
            )
          )
        ORDER BY s.class_name, s.name
      `).all(teacher_id);
    } else if (scope === "subject" && subject) {
      students = db.prepare(`
        SELECT DISTINCT s.* FROM students s
        JOIN student_records r ON s.id = r.student_id
        WHERE r.subject = ? AND r.academic_session = ? AND r.term = ?
        ORDER BY s.class_name, s.name
      `).all(subject, session, term);
    } else {
      // All students
      students = db.prepare("SELECT * FROM students ORDER BY class_name, name ASC").all();
    }

    // For each student, fetch their grade records for this session/term
    const getRecords = db.prepare(
      "SELECT subject, score, breakdown FROM student_records WHERE student_id = ? AND academic_session = ? AND term = ?"
    );
    const getDomains = db.prepare(
      "SELECT domain_type, trait, grade FROM student_domains WHERE student_id = ? AND academic_session = ? AND term = ?"
    );
    const getRemark = db.prepare(
      "SELECT remark, principal_remark FROM teacher_remarks WHERE student_id = ? AND academic_session = ? AND term = ?"
    );

    // Aggregate Explicit Subjects 
    const getExplicitSubjects = db.prepare("SELECT subject FROM student_subjects WHERE student_id = ?");

    const results = students.map((stu) => {
      const records = getRecords.all(stu.id, session, term);
      const explicitSubjs = getExplicitSubjects.all(stu.id).map(r => r.subject);

      // Map explicit subjects. If a record exists, use that.
      // If a record exists that ISN'T in explicit subjects, we still include it to avoid data loss.
      const resolvedSubjects = new Map();
      
      explicitSubjs.forEach(sName => {
        resolvedSubjects.set(sName, { name: sName, score: null, breakdown: {} });
      });
      
      records.forEach(r => {
        resolvedSubjects.set(r.subject, {
          name: r.subject,
          score: r.score,
          breakdown: (() => { try { return JSON.parse(r.breakdown); } catch { return {}; } })(),
        });
      });

      let allSubjectsArray = Array.from(resolvedSubjects.values());
      if (scope === "subject" && subject) {
        allSubjectsArray = allSubjectsArray.filter(s => s.name === subject);
      }

      // Filter out zero-score empty subjects so avg isn't polluted by ungraded subjects
      const gradedSubjects = allSubjectsArray.filter(s => s.score !== null);
      const totalScore = gradedSubjects.reduce((sum, s) => sum + s.score, 0);
      const avg = gradedSubjects.length ? (totalScore / gradedSubjects.length).toFixed(1) : "—";

      const domains = getDomains.all(stu.id, session, term);
      const remark = getRemark.get(stu.id, session, term) || {};

      return {
        ...stu,
        subjects: allSubjectsArray,
        total_score: totalScore,
        average: avg,
        domains,
        remark: remark.remark || "",
        principal_remark: remark.principal_remark || "",
      };
    });

    return { ok: true, results, session, term };
  } catch (err) {
    console.error("[query-results] Error:", err.message);
    return { ok: false, error: err.message, results: [] };
  }
});

// ── V2.1: Save Attendance ────────────────────────────────────────────────────
ipcMain.handle("save-attendance", (event, { student_id, session, term, total_days, days_attended }) => {
  try {
    const db = database.getDb();
    db.prepare(`
      INSERT INTO student_attendance (student_id, academic_session, term, total_days, days_attended)
      VALUES (@student_id, @session, @term, @total_days, @days_attended)
      ON CONFLICT(student_id, academic_session, term)
      DO UPDATE SET total_days=excluded.total_days, days_attended=excluded.days_attended
    `).run({ student_id, session, term, total_days: total_days || 0, days_attended: days_attended || 0 });
    return { ok: true };
  } catch (err) {
    console.error('[Attendance] save-attendance failed:', err);
    return { ok: false, error: err.message };
  }
});

// ── V2.1: Get Attendance (by class+session+term) ───────────────────────────────
ipcMain.handle("get-attendance", (event, { class_name, session, term }) => {
  try {
    const db = database.getDb();
    const rows = db.prepare(`
      SELECT sa.student_id, sa.total_days, sa.days_attended,
             (sa.total_days - sa.days_attended) AS days_absent
      FROM student_attendance sa
      JOIN students s ON s.id = sa.student_id
      WHERE (`+ (class_name ? `s.class_name = @class_name AND ` : '') +`
            sa.academic_session = @session AND sa.term = @term)
    `).all({ class_name: class_name || '', session: session || '2024/2025', term: term || 'First Term' });
    return { ok: true, rows };
  } catch (err) {
    console.error('[Attendance] get-attendance failed:', err);
    return { ok: false, error: err.message, rows: [] };
  }
});

// ── V2: Save Domain Scores (Affective / Psychomotor) ─────────────────────────
ipcMain.handle("save-domain-scores", (event, { student_id, session, term, domains }) => {
  try {
    const db = database.getDb();
    const upsert = db.prepare(`
      INSERT INTO student_domains (student_id, academic_session, term, domain_type, trait, grade)
      VALUES (@student_id, @session, @term, @domain_type, @trait, @grade)
      ON CONFLICT(student_id, academic_session, term, domain_type, trait)
      DO UPDATE SET grade = excluded.grade
    `);
    const run = db.transaction(() => {
      for (const d of domains) {
        upsert.run({ student_id, session, term, domain_type: d.domain_type, trait: d.trait, grade: d.grade });
      }
    });
    run();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── V2: Save Teacher / Principal Remark ──────────────────────────────────────
ipcMain.handle("save-teacher-remark", (event, { student_id, teacher_id, session, term, remark, principal_remark }) => {
  try {
    const db = database.getDb();
    db.prepare(`
      INSERT INTO teacher_remarks (student_id, teacher_id, academic_session, term, remark, principal_remark)
      VALUES (@student_id, @teacher_id, @session, @term, @remark, @principal_remark)
      ON CONFLICT(student_id, academic_session, term)
      DO UPDATE SET remark = excluded.remark, principal_remark = excluded.principal_remark
    `).run({ student_id, teacher_id: teacher_id || null, session, term, remark: remark || "", principal_remark: principal_remark || "" });
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
// ── Last image path for clipboard ─────────────────────────────────────────────
let _lastImagePath = null;

ipcMain.handle("copy-result-image", async (event, { imagePath } = {}) => {
  const target = imagePath || _lastImagePath;
  if (!target || !fs.existsSync(target)) return { ok: false, error: "No image found" };
  const img = nativeImage.createFromPath(target);
  clipboard.writeImage(img);
  return { ok: true };
});

// ── Shared helpers ─────────────────────────────────────────────────────────────
// Templates Extracted to @nexus/engine
console.log("[Electron] Registering generate-reports handler...");
ipcMain.handle("generate-reports", async (event, payload) => {
  const { termConfig, reportType = "terminal", format = "pdf" } = payload || {};
  try {
    const outFolder = path.join(app.getPath("desktop"), "NexusReports");
    if (!fs.existsSync(outFolder)) fs.mkdirSync(outFolder, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

    let html = "";
    let outPath = "";
    const baseDir = path.join(__dirname, "../../private_engine");
    
    if (reportType !== "broadsheet") {
        html = reports.generateHTMLPages(payload, baseDir);
        outPath = path.join(outFolder, `TerminalReport_${termConfig?.term?.replace(/\s/g,"_")||"Term"}_${timestamp}.${format === "image" ? "png" : "pdf"}`);
    } else {
        html = reports.generateBroadsheetHTML(payload);
        outPath = path.join(outFolder, `Broadsheet_${payload.subject?.replace(/\s/g,"_")}_${timestamp}.${format === "image" ? "png" : "pdf"}`);
    }

    if (format === "html") {
         outPath = outPath.replace(".pdf", ".html").replace(".png", ".html");
         fs.writeFileSync(outPath, html, "utf8");
         require('electron').shell.openPath(outFolder);
         return { success: true, path: outPath, folder: outFolder, format };
    }

    await new Promise((resolve, reject) => {
        let hw = new BrowserWindow({ show: false, width: 794, height: 1123, webPreferences: { offscreen: true } });
        hw.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        hw.webContents.on("did-finish-load", async () => {
          try {
            if (format === "image") {
              const image = await hw.webContents.capturePage();
              fs.writeFileSync(outPath, image.toPNG());
            } else {
              const buf = await hw.webContents.printToPDF({ printBackground: true, pageSize: "A4", landscape: (reportType === "broadsheet") });
              fs.writeFileSync(outPath, buf);
            }
            hw.close(); hw = null; resolve();
          } catch(e) { hw?.close(); reject(e); }
        });
    });

    require('electron').shell.openPath(outFolder);
    return { success: true, path: outPath, folder: outFolder, format };

  } catch (err) {
    console.error(`[Electron] Report generation failed:`, err);
    throw err;
  }
});







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
          { type: 'separator' },
          { role: 'quit' }
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'delete' },
          { role: 'selectall' }
        ]
      }
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

  // ── Dev shortcuts: Cmd+R → reload, Cmd+Option+I → DevTools ───────────────
  globalShortcut.register("CommandOrControl+R", () => {
    if (mainWindow) mainWindow.webContents.reload();
  });
  globalShortcut.register("CommandOrControl+Alt+I", () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools();
  });

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

  app.on("will-quit", () => {
    // Release all keyboard shortcuts so they don't linger in other apps
    globalShortcut.unregisterAll();
  });
} else {
  console.warn(
    "[Nexus] Running in non-electron environment. UI will not be launched.",
  );
}
