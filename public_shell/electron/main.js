console.log("\n\n*******************************************");
console.log("*       NEXUS DEMO HUB - VERSION 2.3      *");
console.log("*******************************************\n");

const { app, BrowserWindow, ipcMain, shell, Menu, dialog, nativeImage, clipboard, globalShortcut } = require("electron");

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const dgram = require("dgram");
const Handlebars = require("handlebars");
const { database, server, reports } = require("../../private_engine");
const { startServer, setSchoolConfig, setSchoolLicense, revokeDevice, handleCSVUpload, clearData } = server;
const address = require("address");
const pulseBot = require('./pulse-bot.js');
const pulseExporter = require('./pulse-exporter.js');
const express = require('express');

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
  signature: "",           // Principal's name (text — used by calligraphy-style templates)
  principalSignBase64: null, // Principal's image signature (uploaded via Settings)
  stamp: "",
  stampStyle: "none",
  stampCustomColor: null
};
let identityFilePath = "";
let qrPayload = null;
let licenseStatus = { locked: false, message: "" };

// ── ALL ipcMain.handle registrations (ONCE at module scope) ──────────────────

ipcMain.on("pulse:start", () => {
    if (licenseStatus?.tier === 'Gold' || licenseStatus?.tier === 'Diamond') {
        pulseBot.startPulse();
    } else {
        console.warn("[Pulse] Attempted start on non-eligible tier:", licenseStatus?.tier);
    }
});
ipcMain.on("pulse:stop", () => pulseBot.destroyPulse());
ipcMain.handle("pulse:status", () => pulseBot.getPulseStatus());

// ── Pulse Cloud Bridge (Turn 2) ───────────────────────────────────────────
ipcMain.on("pulse:save-google-creds", (event, { clientId, clientSecret }) => {
    const db = database.getDb();
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('google_client_id', ?)").run(clientId);
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('google_client_secret', ?)").run(clientSecret);
    pulseExporter.init();
});

ipcMain.handle("pulse:get-google-auth-url", async () => {
    await pulseExporter.init();
    if (!pulseExporter.oAuth2Client) return null;
    return pulseExporter.oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/drive.file'],
        prompt: 'consent'
    });
});

ipcMain.handle("pulse:get-cloud-status", () => {
    return {
        isConfigured: !!pulseExporter.oAuth2Client,
        isSyncing: pulseExporter.isSyncing,
        securityKey: pulseExporter.getOrCreateSecurityKey(),
        refreshToken: pulseExporter.getRefreshToken()
    };
});

ipcMain.on("pulse:trigger-sync", () => pulseExporter.syncToDrive());

ipcMain.handle("get-identity", () => {
  return { ...identityPacket, tier: licenseStatus?.tier || "Silver" };
});

ipcMain.handle("get-unique-metadata", () => {
  try {
    const db = database.getDb();
    const classes = db.prepare("SELECT DISTINCT class_name FROM students WHERE class_name IS NOT NULL AND class_name != '' ORDER BY class_name ASC").all().map(r => r.class_name);
    
    const subjects = db.prepare(`
      SELECT DISTINCT subject FROM student_subjects 
      UNION 
      SELECT DISTINCT subject FROM teacher_allocations
      WHERE subject IS NOT NULL AND subject != ''
      ORDER BY subject ASC
    `).all().map(r => r.subject);
    
    return { classes, subjects };
  } catch (err) {
    console.error("Failed to fetch unique metadata:", err);
    return { classes: [], subjects: [] };
  }
});

ipcMain.handle("get-teachers", () => {
  try {
    const db = database.getDb();
    const teachers = db
      .prepare(`
        SELECT t.id, t.name, t.phone, t.email, t.signature, f.class_name as host_class
        FROM teachers t
        LEFT JOIN form_teachers f ON t.id = f.teacher_id
        ORDER BY t.name ASC
      `)
      .all();
    
    // Enrich with subject allocations
    for (const t of teachers) {
      t.allocations = db.prepare("SELECT class_name, subject FROM teacher_allocations WHERE teacher_id = ?").all(t.id);
    }
    
    return teachers;
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
  (event, { id, name, phone, email, signature, allocations }) => {
    try {
      const db = database.getDb();
      db.prepare(
        `INSERT INTO teachers (id, name, phone, email, signature)
         VALUES (@id, @name, @phone, @email, @signature)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, phone=excluded.phone,
           email=excluded.email, signature=excluded.signature`,
      ).run({ id, name, phone: phone || "", email: email || "", signature: signature || null });

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
ipcMain.handle("update-teacher-full", (event, { id, name, phone, email, signature, allocations, host_class }) => {
  try {
    const db = database.getDb();
    db.transaction(() => {
      db.prepare(
        "UPDATE teachers SET name=@name, phone=@phone, email=@email, signature=@signature WHERE id=@id",
      ).run({ id, name: name || "", phone: phone || "", email: email || "", signature: signature || null });
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
      // Sync Form Teacher role
      db.prepare("DELETE FROM form_teachers WHERE teacher_id = ?").run(id);
      if (host_class) {
        db.prepare(`
          INSERT INTO form_teachers (class_name, teacher_id) 
          VALUES (?, ?)
          ON CONFLICT(class_name) DO UPDATE SET teacher_id = excluded.teacher_id
        `).run(host_class, id);
      }
    })();
    console.log(`[Form] Teacher ${id} fully updated (Host: ${host_class || 'None'}).`);
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
      INSERT INTO school_term_config
        (id, academic_session, term, resumption_date, term_start_date, term_end_date,
         grading_scale, show_position, show_domains, show_attendance, attendance_score_weight, template)
      VALUES
        (1, @academic_session, @term, @resumption_date, @term_start_date, @term_end_date,
         @grading_scale, @show_position, @show_domains, @show_attendance, @attendance_score_weight, @template)
      ON CONFLICT(id) DO UPDATE SET
        academic_session = excluded.academic_session,
        term             = excluded.term,
        resumption_date  = excluded.resumption_date,
        term_start_date  = excluded.term_start_date,
        term_end_date    = excluded.term_end_date,
        grading_scale    = excluded.grading_scale,
        show_position    = excluded.show_position,
        show_domains     = excluded.show_domains,
        show_attendance  = excluded.show_attendance,
        attendance_score_weight = excluded.attendance_score_weight,
        template         = excluded.template
    `).run({
      academic_session: config.academic_session || "2024/2025",
      term:             config.term || "First Term",
      resumption_date:  config.resumption_date  || "",
      term_start_date:  config.term_start_date  || "",
      term_end_date:    config.term_end_date    || "",
      grading_scale: typeof config.grading_scale === "string"
        ? config.grading_scale
        : JSON.stringify(config.grading_scale || []),
      show_position: config.show_position ? 1 : 0,
      show_domains:  config.show_domains  ? 1 : 0,
      show_attendance: config.show_attendance ? 1 : 0,
      attendance_score_weight: Number(config.attendance_score_weight) || 0,
      template:      config.template || "clean_slate",
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── V2: Query Results (dynamic scope filtering) ───────────────────────────────
ipcMain.handle("query-results", (event, { scope, session, term, class_name, subject, teacher_id, student_id }) => {
  console.log(`[Diagnostic] query-results: scope=${scope}, session=${session}, term=${term}`);
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
    
    // V2.1 Optimized: Fetch all form teachers into a map once per batch
    const formTeacherMap = new Map();
    db.prepare(`
      SELECT f.class_name, t.name, t.signature 
      FROM form_teachers f
      JOIN teachers t ON f.teacher_id = t.id
    `).all().forEach(ft => formTeacherMap.set(ft.class_name, ft));

    // Gold Phase A: Daily Attendance Aggregation
    const classDaysMap = new Map();
    db.prepare(`
      SELECT class_name, count(DISTINCT date) as total_days 
      FROM daily_attendance 
      WHERE academic_session = ? AND term = ? 
      GROUP BY class_name
    `).all(session, term).forEach(r => classDaysMap.set(r.class_name, r.total_days));

    const getStudentAttendanceCount = db.prepare(`
      SELECT count(*) as days_attended 
      FROM daily_attendance 
      WHERE student_id = ? AND status IN ('Present', 'Late') AND academic_session = ? AND term = ?
    `);

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

      // NEW: Look up form teacher for this class
      const ft = formTeacherMap.get(stu.class_name) || {};

      // NEW: Resolve attendance
      const classTotalDays = classDaysMap.get(stu.class_name) || 0;
      const attRow = getStudentAttendanceCount.get(stu.id, session, term) || { days_attended: 0 };
      const daysAttended = attRow.days_attended;

      // V2.2: Resolve official stamp
      let schoolStamp = identityPacket.stamp || null;
      if (identityPacket.stampStyle && identityPacket.stampStyle !== "none" && !schoolStamp) {
        const stampColor = identityPacket.stampCustomColor || (identityPacket.tier === "Silver" ? "#0D47A1" : identityPacket.themePrimary);
        schoolStamp = generateStampSVG(identityPacket.stampStyle, identityPacket.name, null, identityPacket.signature, stampColor);
      }

      return {
        ...stu,
        subjects: allSubjectsArray,
        total_score: totalScore,
        average: avg,
        domains,
        attendance: {
          total_days: classTotalDays,
          days_attended: daysAttended
        },
        remark: remark.remark || "",
        principal_remark: remark.principal_remark || "",
        form_teacher_name: ft.name || "",
        form_teacher_signature: ft.signature || null,
        // Text name (for calligraphy-style templates like Monarch, Sterling, Apex)
        principal_signature: identityPacket.signature || null,
        // Image signature (for clean_slate, azure and any template using identity.principalSignatureBase64)
        // This is forwarded to report-compiler via the identity object directly — not this per-student field
        principal_stamp: schoolStamp,
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
      VALUES (
        @student_id, 
        COALESCE(@teacher_id, (SELECT teacher_id FROM form_teachers WHERE class_name = (SELECT class_name FROM students WHERE id = @student_id))),
        @session, @term, @remark, @principal_remark
      )
      ON CONFLICT(student_id, academic_session, term)
      DO UPDATE SET 
        remark = excluded.remark, 
        principal_remark = excluded.principal_remark,
        teacher_id = COALESCE(excluded.teacher_id, teacher_remarks.teacher_id)
    `).run({ student_id, teacher_id: teacher_id || null, session, term, remark: remark || "", principal_remark: principal_remark || "" });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("save-bulk-remarks", (event, remarksArray) => {
  try {
    const db = database.getDb();
    const insert = db.prepare(`
      INSERT INTO teacher_remarks (student_id, teacher_id, academic_session, term, remark, principal_remark)
      VALUES (
        @student_id, 
        COALESCE(@teacher_id, (SELECT teacher_id FROM form_teachers WHERE class_name = (SELECT class_name FROM students WHERE id = @student_id))),
        @session, @term, @remark, @principal_remark
      )
      ON CONFLICT(student_id, academic_session, term)
      DO UPDATE SET 
        remark = excluded.remark, 
        principal_remark = excluded.principal_remark,
        teacher_id = COALESCE(excluded.teacher_id, teacher_remarks.teacher_id)
    `);
    
    const insertAtt = db.prepare(`
      INSERT INTO student_attendance (student_id, academic_session, term, total_days, days_attended)
      VALUES (@student_id, @session, @term, @total_days, @days_attended)
      ON CONFLICT(student_id, academic_session, term)
      DO UPDATE SET total_days=excluded.total_days, days_attended=excluded.days_attended
    `);

    const transaction = db.transaction((remarks) => {
      for (const r of remarks) {
        insert.run({
          student_id: r.student_id,
          teacher_id: r.teacher_id || null,
          session: r.session,
          term: r.term,
          remark: r.remark || "",
          principal_remark: r.principal_remark || ""
        });

        // Also sync attendance if provided
        if (r.total_days !== undefined) {
          insertAtt.run({
            student_id: r.student_id,
            session: r.session,
            term: r.term,
            total_days: r.total_days || 0,
            days_attended: r.days_attended || 0
          });
        }
      }
    });

    transaction(remarksArray);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── V2.2: Dynamic Stamp Engine ──────────────────────────────────────────────
function generateStampSVG(style, schoolName, date, principalName, color = "#0D47A1") {
  const name = (schoolName || "NEXUS ACADEMY").toUpperCase();
  const dateStr = date || new Date().toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" });
  const pName = (principalName || "").toUpperCase();
  
  if (style === "classic_round") {
    return `data:image/svg+xml;base64,${Buffer.from(`
      <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <circle cx="100" cy="100" r="95" fill="none" stroke="${color}" stroke-width="3" />
        <circle cx="100" cy="100" r="80" fill="none" stroke="${color}" stroke-width="1.5" />
        <path id="curve" d="M 30,100 A 70,70 0 1,1 170,100" fill="none" />
        <text fill="${color}" font-family="Inter, sans-serif" font-weight="900" font-size="16">
          <textPath href="#curve" startOffset="50%" text-anchor="middle">${name}</textPath>
        </text>
        <path id="curve-bottom" d="M 30,100 A 70,70 0 1,0 170,100" fill="none" />
        <text fill="${color}" font-family="Inter, sans-serif" font-weight="700" font-size="12">
          <textPath href="#curve-bottom" startOffset="50%" text-anchor="middle">OFFICIAL SEAL</textPath>
        </text>
        <text x="100" y="105" fill="${color}" font-family="Inter, sans-serif" font-weight="800" font-size="14" text-anchor="middle">${dateStr}</text>
        <text x="100" y="125" fill="${color}" font-family="Inter, sans-serif" font-weight="600" font-size="9" text-anchor="middle">${pName}</text>
      </svg>
    `).toString("base64")}`;
  }
  
  if (style === "modern_rect") {
    return `data:image/svg+xml;base64,${Buffer.from(`
      <svg width="240" height="100" viewBox="0 0 240 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="5" width="230" height="90" rx="8" fill="none" stroke="${color}" stroke-width="4" />
        <line x1="5" y1="30" x2="235" y2="30" stroke="${color}" stroke-width="2" />
        <text x="120" y="22" fill="${color}" font-family="Inter, sans-serif" font-weight="900" font-size="12" text-anchor="middle">${name}</text>
        <text x="120" y="65" fill="${color}" font-family="Inter, sans-serif" font-weight="950" font-size="28" text-anchor="middle">APPROVED</text>
        <text x="120" y="88" fill="${color}" font-family="Inter, sans-serif" font-weight="700" font-size="12" text-anchor="middle">${dateStr}</text>
      </svg>
    `).toString("base64")}`;
  }

  if (style === "ribbon_endorse") {
    return `data:image/svg+xml;base64,${Buffer.from(`
      <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <path d="M100 10 L115 45 L150 45 L120 70 L135 105 L100 85 L65 105 L80 70 L50 45 L85 45 Z" fill="none" stroke="${color}" stroke-width="3" />
        <circle cx="100" cy="55" r="40" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="4" />
        <text x="100" y="140" fill="${color}" font-family="Inter, sans-serif" font-weight="900" font-size="14" text-anchor="middle">${name}</text>
        <text x="100" y="160" fill="${color}" font-family="Inter, sans-serif" font-weight="700" font-size="16" text-anchor="middle">CERTIFIED</text>
        <text x="100" y="180" fill="${color}" font-family="Inter, sans-serif" font-weight="600" font-size="12" text-anchor="middle">${dateStr}</text>
      </svg>
    `).toString("base64")}`;
  }
  
  if (style === "minimal_sig") {
    return `data:image/svg+xml;base64,${Buffer.from(`
      <svg width="200" height="80" viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg">
        <line x1="20" y1="50" x2="180" y2="50" stroke="${color}" stroke-width="2" />
        <text x="100" y="40" fill="${color}" font-family="Inter, sans-serif" font-weight="700" font-size="12" text-anchor="middle">OFFICIALLY SIGNED</text>
        <text x="100" y="65" fill="${color}" font-family="Inter, sans-serif" font-weight="800" font-size="14" text-anchor="middle">${dateStr}</text>
        <text x="100" y="75" fill="${color}" font-family="Inter, sans-serif" font-weight="500" font-size="8" text-anchor="middle">${name}</text>
      </svg>
    `).toString("base64")}`;
  }

  return null;
}

ipcMain.handle("get-stamp-preview", (event, { style, color }) => {
  return generateStampSVG(style, identityPacket.name, null, identityPacket.signature, color);
});

ipcMain.handle("get-form-teachers", () => {
  try {
    const db = database.getDb();
    const rows = db.prepare(`
      SELECT f.class_name, f.teacher_id, t.name as teacher_name 
      FROM form_teachers f
      JOIN teachers t ON f.teacher_id = t.id
    `).all();
    return { ok: true, data: rows };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("set-form-teacher", (event, { class_name, teacher_id }) => {
  try {
    const db = database.getDb();
    if (!teacher_id) {
      db.prepare(`DELETE FROM form_teachers WHERE class_name = ?`).run(class_name);
      return { ok: true };
    }
    db.prepare(`
      INSERT INTO form_teachers (class_name, teacher_id)
      VALUES (?, ?)
      ON CONFLICT(class_name) DO UPDATE SET teacher_id = excluded.teacher_id
    `).run(class_name, teacher_id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("get-daily-attendance", (event, { class_name, date }) => {
  try {
    const db = database.getDb();
    const rows = db.prepare(`
      SELECT student_id, status, source
      FROM daily_attendance
      WHERE class_name = ? AND date = ?
    `).all(class_name, date);

    // Return term dates alongside records so the renderer can validate
    // the selected date without an extra IPC round-trip.
    const cfg = db.prepare(`
      SELECT term_start_date, term_end_date
      FROM school_term_config WHERE id = 1
    `).get() || {};

    return {
      ok: true,
      data: rows,
      term_start_date: cfg.term_start_date || null,
      term_end_date:   cfg.term_end_date   || null,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("save-daily-attendance", (event, { class_name, date, session, term, records }) => {
  try {
    const db = database.getDb();
    const insert = db.prepare(`
      INSERT INTO daily_attendance (student_id, class_name, date, status, academic_session, term, source)
      VALUES (?, ?, ?, ?, ?, ?, 'admin')
      ON CONFLICT(student_id, date) DO UPDATE SET 
        status = excluded.status,
        source = excluded.source
    `);
    
    const transaction = db.transaction((recs) => {
      for (const rec of recs) {
        insert.run(rec.student_id, class_name, date, rec.status, session, term);
      }
    });
    transaction(records);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("get-student-attendance-report", (event, { student_id }) => {
  try {
    const db = database.getDb();
    // Fetch all attendance for the student
    const rows = db.prepare(`
      SELECT date, status, academic_session, term, class_name, source 
      FROM daily_attendance 
      WHERE student_id = ? 
      ORDER BY date DESC
    `).all(student_id);
    return { ok: true, data: rows };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("save-identity", (event, newIdentity) => {
  try {
    // Ensure identityFilePath is set
    if (!identityFilePath) {
      const userDataPath = require('electron').app.getPath("userData");
      identityFilePath = require('path').join(userDataPath, "identity.json");
    }
    
    identityPacket = { ...identityPacket, ...newIdentity };
    fs.writeFileSync(identityFilePath, JSON.stringify(identityPacket, null, 2));
    console.log("[Electron] Identity saved locally.");
    
    if (qrPayload) {
      qrPayload.config = identityPacket;
      setSchoolConfig(qrPayload.config);
      if (mainWindow) mainWindow.webContents.send("qr-payload", qrPayload);
    }
    
    return { ok: true, identity: { ...identityPacket, tier: licenseStatus?.tier || "Silver" } };
  } catch (err) {
    console.error("Failed to save identity:", err);
    return { ok: false, error: err.message };
  }
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

ipcMain.handle("revoke-device", async (event, deviceId) => {
  console.log(`[License] Revoking device: ${deviceId}`);
  revokeDevice(deviceId);
  if (mainWindow) {
    mainWindow.webContents.send("revoke-broadcast", deviceId);
  }
  return { ok: true };
});

// Pulse heartbeat bridge for Phase 3.1 UDP packets
ipcMain.handle('pulse-bridge-ready', () => {
    // This is just to acknowledge UI is ready to receive
    return true;
});

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

    // Write to a robust temp file to bypass Windows Chromium data:URL string length truncation
    const tempHtmlPath = path.join(app.getPath("desktop"), `nexus_report_temp_${Date.now()}.html`);
    fs.writeFileSync(tempHtmlPath, html, "utf8");

    await new Promise((resolve, reject) => {
        let hw = new BrowserWindow({ show: false, width: 794, height: 1123, webPreferences: { offscreen: true } });
        hw.loadFile(tempHtmlPath);
        hw.webContents.on("did-finish-load", async () => {
          try {
            if (format === "image") {
              const image = await hw.webContents.capturePage();
              fs.writeFileSync(outPath, image.toPNG());
            } else {
              const buf = await hw.webContents.printToPDF({ printBackground: true, pageSize: "A4", landscape: (reportType === "broadsheet") });
              fs.writeFileSync(outPath, buf);
            }
            hw.close(); hw = null;
            // Clean up temp file
            if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);
            resolve();
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
    let dbPath = path.join(userDataPath, "nexus.sqlite");
    
    // DEMO MODE: Prioritize the seeded DB in the project root if it exists
    const repoDbPath = path.join(__dirname, "../../private_engine/nexus.sqlite");
    if (fs.existsSync(repoDbPath)) {
        dbPath = repoDbPath;
    }
    
    const betterSqlite3 = require("better-sqlite3");
    database.init(dbPath, betterSqlite3);
    
    // FINAL DEMO CHECK: Print the number of records found
    try {
        const db = database.getDb();
        const count = db.prepare("SELECT COUNT(*) as c FROM student_records").get().c;
        console.log(`\n[Database] HARDENED SYNC CHECK: FOUND ${count} GRADE RECORDS\n`);
    } catch(e) {
        console.warn("[Database] Sync Check Failed (Likely new DB):", e.message);
    }

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

  pulseBot.initPulseBot(mainWindow);
  pulseExporter.onSyncError = (message) => {
      if (mainWindow) mainWindow.webContents.send("pulse:sync-error", message);
  };

  pulseExporter.init().then(() => {
      // If initialized and Diamond tier, start periodic sync
      if (pulseExporter.oAuth2Client && licenseStatus?.tier === 'Diamond') {
          pulseExporter.startPeriodicSync();
      }
  });

  // Small callback server for Google Auth
  const callbackServer = express();
  callbackServer.get('/google-callback', async (req, res) => {
      const { code } = req.query;
      if (code && pulseExporter.oAuth2Client) {
          try {
              const { tokens } = await pulseExporter.oAuth2Client.getToken(code);
              const db = database.getDb();
              db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('google_tokens', ?)").run(JSON.stringify(tokens));
              pulseExporter.oAuth2Client.setCredentials(tokens);
              pulseExporter.startPeriodicSync();
              res.send("<h1>Authentication Successful!</h1><p>You can close this window now.</p>");
              if (mainWindow) mainWindow.webContents.send("pulse:cloud-synced");
          } catch (err) {
              res.status(500).send("Authentication failed: " + err.message);
          }
      } else {
          res.send("Invalid callback.");
      }
  });
  callbackServer.listen(3005, () => console.log("[Pulse] Google Auth callback server listening on port 3005"));

  // ── Dev shortcuts: Cmd+R → reload, Cmd+Option+I → DevTools ───────────────
  globalShortcut.register("CommandOrControl+R", () => {
    if (mainWindow) mainWindow.webContents.reload();
  });
  globalShortcut.register("CommandOrControl+Alt+I", () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools();
  });

  // Start the Handshake Server
  const port = 3000;
  const serverInstance = startServer(port); // Returns the event emitter

  serverInstance.on('capacity-alert', (data) => {
    console.warn(`[License] Capacity Limit Breached during sync! ${data.totalFailed} students rejected.`);
    if (mainWindow) {
      mainWindow.webContents.send("show-upgrade-modal", { reason: "capacity_reached", detail: data });
    }
  });

  // ── Phase 3.1: The Pulse (UDP Listener) ────────────────────────────
  const udpServer = dgram.createSocket('udp4');
  udpServer.on('error', (err) => {
    console.warn(`[Pulse] UDP server error:\n${err.stack}`);
    udpServer.close();
  });
  udpServer.on('message', (msg, rinfo) => {
    try {
      const payload = JSON.parse(msg.toString());
      if (mainWindow) {
        mainWindow.webContents.send("pulse-heartbeat", payload);
      }
    } catch (e) { /* ignore invalid JSON */ }
  });
  udpServer.on('listening', () => {
    const address = udpServer.address();
    console.log(`[Pulse] Heartbeat server listening on ${address.address}:${address.port}`);
  });
  udpServer.bind(3001);


  // ── Phase 4: License Enforcement Engine & Security Lock ────────────
  // licenseStatus already initialized at module scope (line 43)

  function getHardwareFingerprint() {
    const cpus = os.cpus();
    const macs = Object.values(os.networkInterfaces())
      .flat()
      .filter(i => i.mac && i.mac !== '00:00:00:00:00:00')
      .map(i => i.mac)
      .sort()
      .join('-');
    return crypto.createHash('sha256').update((cpus[0]?.model || "") + macs).digest('hex');
  }

  const hardwareId = getHardwareFingerprint();
  console.log(`[Security] Derived Motherboard Fingerprint: ${hardwareId.substring(0, 8)}...`);

  ipcMain.handle("get-hardware-id", () => hardwareId);

  try {
    const userDataPath = app.getPath("userData");
    const licensePath = path.join(userDataPath, "license.nexus");
    const sysConfPath = path.join(userDataPath, "nexus_sys.json");
    
    // Developer Override
    if (process.env.DEV_MODE === "true") {
      console.log("[Security] DEV_MODE active. Bypassing Hardware/Clock locks.");
      licenseStatus = { 
        locked: false, 
        message: "DEV_MODE_ACTIVE",
        student_count: 999999,
        expires_at: Date.now() + 10000000000
      };
      licenseStatus.tier = process.env.DEV_MOCK_TIER || "Diamond";
      setSchoolLicense({ payload: JSON.stringify({ tier: licenseStatus.tier, student_count: licenseStatus.student_count, expires_at: licenseStatus.expires_at }) });
    } else {
      // 1. Time-Drift Guard (Anti-Rollback)
      let lastRunTimestamp = 0;
      if (fs.existsSync(sysConfPath)) {
        const sysConf = JSON.parse(fs.readFileSync(sysConfPath, "utf-8"));
        lastRunTimestamp = sysConf.last_run_timestamp || 0;
      }

      if (Date.now() < (lastRunTimestamp - 60000)) { // 1 min buffer for marginal OS sync
          console.error("[Security] FATAL: System Clock Rollback Detected!");
          licenseStatus = { locked: true, message: "System Clock Tampering Detected. Access Blocked." };
      } else {
          fs.writeFileSync(sysConfPath, JSON.stringify({ last_run_timestamp: Date.now() }));
      }

      // 2. Load Nexus Public Key
      const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAU//Zax5arKg2zRA+d4F+kE6H19E977fhJrU/rNqcdw8=
-----END PUBLIC KEY-----`;
      const publicKey = crypto.createPublicKey(PUBLIC_KEY_PEM);

      // 3. Verify License
      if (!fs.existsSync(licensePath)) {
        licenseStatus = { locked: true, message: "No Valid License Found. Please contact your Nexus Partner." };
      } else {
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
            message: "Tampering Detected. Cryptographic signature invalid. Contact Administrator.",
          };
        } else {
          const payloadDecoded = JSON.parse(licenseDisk.payload);
          licenseStatus.tier = payloadDecoded.tier || "Silver";
          
          // Hardware Check
          if (payloadDecoded.hardware_id && payloadDecoded.hardware_id !== hardwareId) {
             licenseStatus = { locked: true, message: "License Device Mismatch. Token bound to different hardware." };
             console.error("[Security] License Tampering: Motherboard swap detected.");
          } else if (Date.now() > payloadDecoded.expires_at) {
            licenseStatus = {
              locked: true,
              message: `License Expired. Your ${payloadDecoded.tier} tier has lapsed. Contact Administrator.`,
            };
          } else {
            if (!licenseStatus.locked) {
               console.log(`[License Engine] Valid ${payloadDecoded.tier} License. Limit: ${payloadDecoded.student_count} students.`);
               licenseStatus = { 
                 locked: false, 
                 message: "VALID",
                 student_count: payloadDecoded.student_count,
                 expires_at: payloadDecoded.expires_at 
               };
               licenseStatus.tier = payloadDecoded.tier || "Silver";
               // Tell the Hub Engine the active max limit
               setSchoolLicense(licenseDisk);
            }
          }
        }
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
  serverInstance.on("handshake-success", (data) => {
    if (mainWindow) {
      mainWindow.webContents.send("handshake-complete", data);
      console.log(`[Electron] Handshake successful for ${data.teacher_name}`);
    }
  });

  // Handle Sync Events
  serverInstance.on("sync-events", (data) => {
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
