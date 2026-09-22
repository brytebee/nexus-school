"use strict";

const { database } = require("@nexus/engine");
const { getMatchableDigits } = require("./phone-utils");
const path = require("path");
const crypto = require("crypto");

let syncTimer = null;
let isSyncing = false;
let mainWindowRef = null;
let lastSyncSuccess = null;
let lastSyncError = null;
// Registered by main.js — called for full settlement (writes fee_transactions + student_fees)
let _onPaymentSettled = null;

function getApiBase() {
  const override = process.env.NEXUS_API_URL;
  if (override) {
    // In packaged (production) builds, silently ignore any non-HTTPS override
    // (e.g. http://localhost:3001 from a misconfigured GitHub Secret).
    // Dev builds (app.isPackaged === false) still honour any override for local testing.
    try {
      const { app } = require('electron');
      if (app.isPackaged && !override.startsWith('https://')) {
        return 'https://api.nexusos.com.ng';
      }
    } catch (_) {}
    return override;
  }
  return 'https://api.nexusos.com.ng';
}

function isCloudEnabled(db) {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'cloud_pulse_enabled'").get();
    return row?.value === 'true';
  } catch (_) {
    return false;
  }
}

function getSchoolId(db) {
  try {
    // 1. Explicit cloud ID set after first successful activation
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'school_cloud_id'").get();
    if (row && row.value) return row.value;

    // 2. Read school_id directly from the license.nexus file on disk
    //    (license_payload is NOT stored in the DB — the file is the source of truth)
    try {
      const { app } = require('electron');
      const fs = require('fs');
      const path = require('path');
      const licensePath = path.join(app.getPath('userData'), 'license.nexus');
      if (fs.existsSync(licensePath)) {
        const raw = fs.readFileSync(licensePath, 'utf8').trim();
        const header = raw.split('.')[0];
        const payload = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
        if (payload.school_id) return payload.school_id;
        if (payload.hardware_id) return payload.hardware_id;
      }
    } catch (_) {}

    // 3. DB fallback — legacy installs that stored license_payload in app_settings
    const licenseRow = db.prepare("SELECT value FROM app_settings WHERE key = 'license_payload'").get();
    if (licenseRow && licenseRow.value) {
      const payload = JSON.parse(licenseRow.value);
      if (payload.school_id) return payload.school_id;
      if (payload.hardware_id) return payload.hardware_id;
    }

    // 4. Final fallback: hardware_id stored in app_settings
    const hwRow = db.prepare("SELECT value FROM app_settings WHERE key = 'hardware_id'").get();
    if (hwRow && hwRow.value) return hwRow.value;
  } catch (_) {}
  return null;
}

function getSyncToken(db) {
  try {
    // 1. Explicit sync token stored in app_settings
    const syncTokenRow = db.prepare("SELECT value FROM app_settings WHERE key = 'nexus_sync_token'").get();
    if (syncTokenRow?.value) return syncTokenRow.value;

    // 2. hardware_id directly in app_settings
    const hwRow = db.prepare("SELECT value FROM app_settings WHERE key = 'hardware_id'").get();
    if (hwRow?.value) return hwRow.value;

    // 3. Return the full signed token from license.nexus — this is the exact
    //    435-char string stored in License.token in PostgreSQL.
    //    verifySyncAuth's (l.token === syncToken) check matches it directly,
    //    requiring no server-side changes.
    try {
      const { app } = require('electron');
      const fs = require('fs');
      const path = require('path');
      const licensePath = path.join(app.getPath('userData'), 'license.nexus');
      if (fs.existsSync(licensePath)) {
        const raw = fs.readFileSync(licensePath, 'utf8').trim();
        if (raw) return raw;
      }
    } catch (_) {}

    // 4. Legacy DB fallback — license_payload key (kept for forward-compat)
    const licenseRow = db.prepare("SELECT value FROM app_settings WHERE key = 'license_payload'").get();
    if (licenseRow?.value) {
      const payload = JSON.parse(licenseRow.value);
      if (payload.hardware_id) return payload.hardware_id;
      if (payload.token) return payload.token;
    }
  } catch (_) {}
  return "nexus_desktop_client";
}

function getSchoolWebsiteUrl(db) {
  let websiteUrl = "";
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'school_website_url'").get();
    if (row && row.value) websiteUrl = row.value.trim().replace(/\/+$/, "");
  } catch (_) {}

  if (!websiteUrl && process.env.SCHOOL_WEBSITE_URL) {
    websiteUrl = process.env.SCHOOL_WEBSITE_URL.trim().replace(/\/+$/, "");
  }

  // Development fallback: when electron runs on 3000, school-website runs on 3005
  if (!websiteUrl) {
    websiteUrl = "http://localhost:3005";
  }

  return websiteUrl;
}

/**
 * 1. Outbound Push: Gathers parent-facing data chunks from local SQLite
 * and pushes to nexus-api /api/sync/push
 */
async function pushSchoolDelta() {
  const db = database.getDb();
  const schoolId = getSchoolId(db);
  if (!schoolId) {
    return { ok: false, reason: "no_school_id" };
  }

  // 1. Gather Students + Fees + Results Summaries + Attendance Stats
  // Belt-and-suspenders: ensure parent_phone_2 column exists before the query.
  // database.init() runs this via alterSafe at every boot, but this guard
  // protects against any future boot-order reordering or direct sync-worker use.
  try { db.exec(`ALTER TABLE students ADD COLUMN parent_phone_2 TEXT DEFAULT NULL`); } catch (_) {}

  const termConfig = db.prepare("SELECT academic_session, term FROM school_term_config WHERE id = 1").get() || {
    academic_session: "2025/2026",
    term: "First Term"
  };

  const students = db.prepare(`
    SELECT s.id, s.name, s.class_name, s.class_arm, s.parent_phone,
           COALESCE(s.parent_phone_2, NULL) as parent_phone_2,
           s.parent_email,
           COALESCE(sf.total_billed, 0) as total_billed,
           COALESCE(sf.total_paid, 0) as total_paid,
           COALESCE(sf.total_billed - sf.total_paid, 0) as fee_balance
    FROM students s
    LEFT JOIN student_fees sf ON sf.student_id = s.id
      AND sf.academic_session = ? AND sf.term = ?
    WHERE s.parent_phone IS NOT NULL AND s.parent_phone != ''
      AND COALESCE(s.is_active, 1) = 1
  `).all(termConfig.academic_session, termConfig.term);

  const studentPayload = students.map((st) => {
    // Query published result summary for active term
    let resultsSummary = [];
    try {
      resultsSummary = db.prepare(`
        SELECT subject, score, grade, remark
        FROM results
        WHERE student_id = ? AND academic_session = ? AND term = ?
      `).all(st.id, termConfig.academic_session, termConfig.term);
    } catch (_) {}

    // Query attendance summary for active term
    let attendanceStats = { present: 0, total: 0, absent_dates: [] };
    try {
      const attRows = db.prepare(`
        SELECT date, status
        FROM attendance
        WHERE student_id = ? AND academic_session = ? AND term = ?
      `).all(st.id, termConfig.academic_session, termConfig.term);

      const total = attRows.length;
      const present = attRows.filter(r => r.status === "Present").length;
      const absentDates = attRows.filter(r => r.status === "Absent").map(r => r.date);
      attendanceStats = { present, total, absent_dates: absentDates };
    } catch (_) {}

    return {
      id: st.id,
      name: st.name,
      class_name: st.class_name,
      class_arm: st.class_arm,
      parent_phone: st.parent_phone,
      parent_phone_2: st.parent_phone_2 || null,
      parent_email: st.parent_email || null,
      total_billed: st.total_billed,
      total_paid: st.total_paid,
      fee_balance: st.fee_balance,
      results_summary: resultsSummary,
      attendance_stats: attendanceStats
    };
  });

  // 2. Gather Published News
  let newsPayload = [];
  try {
    newsPayload = db.prepare(`
      SELECT title, category, body
      FROM portal_news
      WHERE is_published = 1
      ORDER BY id DESC LIMIT 10
    `).all();
  } catch (_) {}

  // 3. Gather Published Policies
  let policiesPayload = [];
  try {
    policiesPayload = db.prepare(`
      SELECT title, body, order_num
      FROM portal_policies
      WHERE is_published = 1
      ORDER BY order_num ASC, id ASC
    `).all();
  } catch (_) {}

  // 4. Gather Fee Settings (FinancialHub settings)
  let feeSettingsPayload = null;
  try {
    const fsRow = db.prepare("SELECT value FROM app_settings WHERE key = 'fee_settings'").get();
    if (fsRow?.value) {
      feeSettingsPayload = JSON.parse(fsRow.value);
    }
  } catch (_) {}

  // 4b. Gather Active Fee Extras (Optional Fees & Materials)
  let extrasPayload = [];
  try {
    extrasPayload = db.prepare(`
      SELECT id, class_name, item_name, amount, term
      FROM fee_extras
      WHERE is_active = 1
      ORDER BY id ASC
    `).all();
  } catch (_) {}

  // 5. Gather Active Paystack Verified Subaccount Code
  let subaccountCode = null;
  try {
    if (feeSettingsPayload?.active_bank_account_id) {
      const acc = db.prepare("SELECT subaccount_code FROM bank_accounts WHERE id = ? AND paystack_verified = 1").get(feeSettingsPayload.active_bank_account_id);
      if (acc?.subaccount_code) subaccountCode = acc.subaccount_code;
    }
    if (!subaccountCode) {
      const acc = db.prepare("SELECT subaccount_code FROM bank_accounts WHERE is_active = 1 AND paystack_verified = 1 AND subaccount_code IS NOT NULL LIMIT 1").get();
      if (acc?.subaccount_code) subaccountCode = acc.subaccount_code;
    }
  } catch (_) {}

  // 6. Gather School Portal Slug and Name
  let portalSlug = null;
  let schoolName = null;
  try {
    const identRow = db.prepare("SELECT value FROM app_settings WHERE key = 'school_identity'").get();
    if (identRow?.value) {
      const parsed = JSON.parse(identRow.value);
      if (parsed.portalSlug) portalSlug = parsed.portalSlug;
      if (parsed.name) schoolName = parsed.name;
    }
  } catch (_) {}

  if (!portalSlug) {
    try {
      const { app } = require('electron');
      const fs = require('fs');
      const path = require('path');
      const idPath = path.join(app.getPath('userData'), 'identity.json');
      if (fs.existsSync(idPath)) {
        const parsed = JSON.parse(fs.readFileSync(idPath, 'utf8'));
        if (parsed.portalSlug) portalSlug = parsed.portalSlug;
        if (parsed.name && !schoolName) schoolName = parsed.name;
      }
    } catch (_) {}
  }

  if (!schoolName) {
    try {
      const nameRow = db.prepare("SELECT value FROM app_settings WHERE key = 'school_name'").get();
      if (nameRow?.value) schoolName = nameRow.value;
    } catch (_) {}
  }

  const syncToken = getSyncToken(db);
  const url = `${getApiBase()}/api/sync/push`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nexus-sync-token": syncToken
    },
    body: JSON.stringify({
      school_id: schoolId,
      delta: {
        students: studentPayload,
        news: newsPayload,
        policies: policiesPayload,
        fee_settings: feeSettingsPayload,
        extras: extrasPayload,
        paystack_subaccount_code: subaccountCode,
        portal_slug: portalSlug,
        school_name: schoolName
      }
    })
  });

  const json = await response.json();
  if (!response.ok || !json.ok) {
    throw new Error(json.error || `Sync push failed with HTTP ${response.status}`);
  }

  if (json.slug_warning) {
    console.warn(`[Sync Worker] ${json.slug_warning}`);
    try {
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('portal_slug_clash_warning', ?)").run(json.slug_warning);
    } catch (_) {}
  } else {
    try {
      db.prepare("DELETE FROM app_settings WHERE key = 'portal_slug_clash_warning'").run();
    } catch (_) {}
  }

  if (json.features) {
    try {
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('feature_results_dispatch', ?)").run(json.features.results_dispatch_active ? '1' : '0');
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send('feature-flags-updated', json.features);
      }
    } catch (fErr) {
      console.warn("[Sync Worker] Failed to persist feature flags on push:", fErr.message);
    }
  }

  return { ok: true, count: studentPayload.length, synced_at: json.synced_at };
}

/**
 * 2. Inbound Pull: Retrieves settled cloud events (Paystack settlements)
 * and reconciles local SQLite tables
 */
async function pullPendingSyncEvents() {
  const db = database.getDb();
  const schoolId = getSchoolId(db);
  if (!schoolId) return { ok: false, reason: "no_school_id" };

  const syncToken = getSyncToken(db);
  const url = `${getApiBase()}/api/sync/pull?school_id=${encodeURIComponent(schoolId)}`;
  const response = await fetch(url, {
    headers: {
      "x-nexus-sync-token": syncToken
    }
  });
  const json = await response.json();

  if (!response.ok || !json.ok) {
    throw new Error(json.error || `Sync pull failed with HTTP ${response.status}`);
  }

  if (json.features) {
    try {
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('feature_results_dispatch', ?)").run(json.features.results_dispatch_active ? '1' : '0');
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send('feature-flags-updated', json.features);
      }
    } catch (fErr) {
      console.warn("[Sync Worker] Failed to persist feature flags on pull:", fErr.message);
    }
  }

  const events = json.events || [];
  const ackIds = [];

  for (const ev of events) {
    if (ev.event_type === "PAYMENT_SETTLED") {
      const {
        paystack_ref,
        amount,
        receipt_url,
        settled_at,
        student_ids,
        parent_phone,
        payment_type
      } = ev.payload || {};

      try {
        if (paystack_ref) {
          // 1. Auto-provision fee_payment_sessions row if payment originated on the cloud
          const rawStudentIds = Array.isArray(student_ids)
            ? student_ids.join(",")
            : (typeof student_ids === "string" ? student_ids : "");
          const totalAmount = Number(amount || 0);

          const existing = db.prepare(
            "SELECT id, status FROM fee_payment_sessions WHERE paystack_ref = ?"
          ).get(paystack_ref);

          if (!existing) {
            db.prepare(`
              INSERT INTO fee_payment_sessions (
                parent_phone, student_ids, total_amount, payment_type, paystack_ref, status, receipt_url, created_at
              ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
            `).run(
              parent_phone || "",
              rawStudentIds,
              totalAmount,
              payment_type || "full",
              paystack_ref,
              receipt_url || null,
              settled_at || new Date().toISOString()
            );
            console.log(`[Sync Worker] Auto-provisioned pending fee session for cloud payment: ${paystack_ref}`);
          }
        }

        if (_onPaymentSettled) {
          // Full path: processSuccessfulPayment() writes fee_transactions,
          // student_fees, marks session 'settled', and sends the WhatsApp receipt.
          // It MUST run while the local session is still 'pending' — if the
          // UPDATE ran first the guard inside processSuccessfulPayment would
          // return early and nothing would be written.
          await _onPaymentSettled(paystack_ref, Math.round((amount || 0) * 100), null);

          // Store the Cloudinary receipt URL if the cloud webhook generated one
          if (receipt_url) {
            try {
              db.prepare(
                `UPDATE fee_payment_sessions SET receipt_url = ? WHERE paystack_ref = ?`
              ).run(receipt_url, paystack_ref);
            } catch (_) {}
          }
        } else {
          // Fallback (no callback — test context or pre-registration race):
          // status flag only.  The 'AND status = 'pending'' guard is critical —
          // without it a duplicate pull would overwrite an already-settled session.
          db.prepare(`
            UPDATE fee_payment_sessions
            SET status = 'settled', settled_at = ?
            WHERE paystack_ref = ? AND status = 'pending'
          `).run(settled_at || new Date().toISOString(), paystack_ref);
        }
        console.log(`[Sync Worker] Reconciled settled payment session: ${paystack_ref}`);
      } catch (err) {
        console.warn(`[Sync Worker] Failed to reconcile payment ${paystack_ref}:`, err.message);
      }
    }
    ackIds.push(ev.id);
  }

  // Acknowledge processed events
  if (ackIds.length > 0) {
    await fetch(`${getApiBase()}/api/sync/ack`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-nexus-sync-token": syncToken
      },
      body: JSON.stringify({ school_id: schoolId, ack_ids: ackIds })
    });
  }

  return { ok: true, processed: ackIds.length };
}

/**
 * 2b. Inbound Online Admissions Pull: Ingests newly accepted candidate bio-data,
 * enrolled subjects, and acceptance fee payments directly from the school web portal.
 */
async function pullOnlineAdmissions() {
  const db = database.getDb();
  const schoolId = getSchoolId(db);
  if (!schoolId) return { ok: false, reason: "no_school_id" };

  const websiteUrl = getSchoolWebsiteUrl(db);
  if (!websiteUrl) {
    return { ok: true, skipped: true, reason: "no_school_website_url" };
  }

  // Read sync token
  let syncToken = "";
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'school_website_sync_token'").get();
    if (row && row.value) syncToken = row.value.trim();
  } catch (_) {}

  if (!syncToken) {
    syncToken = process.env.SCHOOL_WEBSITE_SYNC_TOKEN || getSyncToken(db);
  }

  const pollUrl = `${websiteUrl}/api/sync/enrollments?school_cloud_id=${encodeURIComponent(schoolId)}&status=accepted`;

  let response;
  try {
    response = await fetch(pollUrl, {
      headers: {
        "x-sync-token": syncToken,
      },
    });
  } catch (netErr) {
    console.warn("[Sync Worker] Failed to connect to school website:", netErr.message);
    return { ok: false, error: netErr.message };
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.warn(`[Sync Worker] School website sync poll returned HTTP ${response.status}: ${errText}`);
    return { ok: false, error: `HTTP ${response.status}` };
  }

  const json = await response.json().catch(() => ({}));
  if (!json.ok || !Array.isArray(json.data)) {
    return { ok: false, error: json.error || "invalid_response_format" };
  }

  const candidates = json.data;
  if (candidates.length === 0) {
    return { ok: true, ingested: 0 };
  }

  // Belt-and-suspenders column check
  try { db.exec("ALTER TABLE students ADD COLUMN parent_phone_2 TEXT DEFAULT NULL"); } catch (_) {}

  const ackIds = [];

  const termConfig = db.prepare("SELECT academic_session, term FROM school_term_config WHERE id = 1").get() || {
    academic_session: "2025/2026",
    term: "First Term",
  };

  for (const cand of candidates) {
    try {
      // Offline-first photo ingestion: Convert remote HTTP/Cloudinary URLs into base64 data URIs
      // so student photos render offline and never depend on external network connectivity
      let photoDataUri = cand.photoUrl || null;
      if (cand.photoUrl && (cand.photoUrl.startsWith('http://') || cand.photoUrl.startsWith('https://'))) {
        try {
          const imgRes = await fetch(cand.photoUrl);
          if (imgRes.ok) {
            const arrayBuffer = await imgRes.arrayBuffer();
            const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
            photoDataUri = `data:${mimeType};base64,${Buffer.from(arrayBuffer).toString('base64')}`;
          }
        } catch (imgErr) {
          console.warn(`[Sync Worker] Could not fetch remote photo for ${cand.studentName}:`, imgErr.message);
        }
      }

      db.transaction(() => {
        // Resolve student ID
        let existing = null;
        if (cand.admissionNo) {
          existing = db.prepare("SELECT id FROM students WHERE admission_no = ? LIMIT 1").get(cand.admissionNo);
        }
        if (!existing && cand.studentName && cand.parentPhone) {
          existing = db.prepare("SELECT id FROM students WHERE name = ? AND parent_phone = ? LIMIT 1").get(cand.studentName, cand.parentPhone);
        }

        const studentId = existing
          ? existing.id
          : (cand.id || `STU-${Date.now().toString(36).toUpperCase()}`);

        // Insert or update student
        db.prepare(`
          INSERT INTO students (
            id, name, class_name, class_arm, reg_no, admission_no, gender, dob, photo,
            parent_email, parent_phone, parent_phone_2, parent_name, fee_status, enrollment_status
          ) VALUES (
            @id, @name, @class_name, @class_arm, @reg_no, @admission_no, @gender, @dob, @photo,
            @parent_email, @parent_phone, @parent_phone_2, @parent_name, @fee_status, @enrollment_status
          )
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            class_name = excluded.class_name,
            class_arm = COALESCE(NULLIF(excluded.class_arm, ''), students.class_arm),
            admission_no = COALESCE(NULLIF(excluded.admission_no, ''), students.admission_no),
            gender = COALESCE(NULLIF(excluded.gender, ''), students.gender),
            dob = COALESCE(NULLIF(excluded.dob, ''), students.dob),
            photo = COALESCE(excluded.photo, students.photo),
            parent_email = COALESCE(NULLIF(excluded.parent_email, ''), students.parent_email),
            parent_phone = COALESCE(NULLIF(excluded.parent_phone, ''), students.parent_phone),
            parent_phone_2 = COALESCE(excluded.parent_phone_2, students.parent_phone_2),
            parent_name = COALESCE(NULLIF(excluded.parent_name, ''), students.parent_name),
            enrollment_status = 'active'
        `).run({
          id: studentId,
          name: cand.studentName,
          class_name: cand.className || cand.classApplied,
          class_arm: cand.classArm || "",
          reg_no: cand.admissionNo || "",
          admission_no: cand.admissionNo || "",
          gender: cand.gender || "",
          dob: cand.dob || "",
          photo: photoDataUri,
          parent_email: cand.parentEmail || "",
          parent_phone: cand.parentPhone || "",
          parent_phone_2: cand.parentPhone2 || null,
          parent_name: cand.parentName || null,
          fee_status: cand.totalPaidKobo > 0 ? "cleared" : "owing",
          enrollment_status: "active",
        });

        // Insert enrolled subjects
        if (Array.isArray(cand.selectedSubjects) && cand.selectedSubjects.length > 0) {
          const insertSubj = db.prepare("INSERT OR IGNORE INTO student_subjects (student_id, subject) VALUES (?, ?)");
          for (const subj of cand.selectedSubjects) {
            if (typeof subj === "string" && subj.trim().length > 0) {
              insertSubj.run(studentId, subj.trim());
            }
          }
        }

        // Record acceptance fee payments
        if (Array.isArray(cand.feePayments) && cand.feePayments.length > 0) {
          for (const payment of cand.feePayments) {
            const amountNaira = (payment.amountKobo || 0) / 100;
            if (amountNaira > 0 && payment.paystackRef) {
              const txExists = db.prepare("SELECT 1 FROM fee_transactions WHERE reference_number = ? LIMIT 1").get(payment.paystackRef);
              if (!txExists) {
                db.prepare(`
                  INSERT INTO fee_transactions (
                    student_id, academic_session, term, amount, payment_method, reference_number, note, recorded_by, created_at
                  ) VALUES (?, ?, ?, ?, 'transfer', ?, ?, 'Online Admission Portal', ?)
                `).run(
                  studentId,
                  termConfig.academic_session,
                  termConfig.term,
                  amountNaira,
                  payment.paystackRef,
                  `Acceptance: ${payment.itemName || 'Admission Fee'} (${payment.receiptNumber || ''})`,
                  payment.paidAt || new Date().toISOString()
                );
              }
            }
          }

          // Recalculate student_fees state
          const totalPaidRow = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total_paid FROM fee_transactions
            WHERE student_id = ? AND academic_session = ? AND term = ?
          `).get(studentId, termConfig.academic_session, termConfig.term);

          const feeRow = db.prepare(`
            SELECT COALESCE(total_billed, 0) AS total_billed FROM student_fees
            WHERE student_id = ? AND academic_session = ? AND term = ?
          `).get(studentId, termConfig.academic_session, termConfig.term) || { total_billed: 0 };

          const paidAmt = totalPaidRow?.total_paid || 0;
          let feeStatus = "unpaid";
          if (paidAmt >= feeRow.total_billed && feeRow.total_billed > 0) {
            feeStatus = "cleared";
          } else if (paidAmt > 0) {
            feeStatus = "partial";
          }

          db.prepare(`
            INSERT INTO student_fees (student_id, academic_session, term, total_billed, total_paid, status, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(student_id, academic_session, term) DO UPDATE SET
              total_paid = excluded.total_paid,
              status     = excluded.status,
              updated_at = datetime('now')
          `).run(studentId, termConfig.academic_session, termConfig.term, feeRow.total_billed, paidAmt, feeStatus);
        }

        ackIds.push(cand.id);
      })();
      console.log(`[Sync Worker] Ingested online candidate: ${cand.studentName} (${cand.admissionNo || cand.id})`);
    } catch (candErr) {
      console.warn(`[Sync Worker] Failed to ingest candidate ${cand.id}:`, candErr.message);
    }
  }

  // Acknowledge successfully ingested enrollments
  if (ackIds.length > 0) {
    try {
      await fetch(`${websiteUrl}/api/sync/enrollments`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-sync-token": syncToken,
        },
        body: JSON.stringify({ enrollmentIds: ackIds }),
      });
      console.log(`[Sync Worker] Acknowledged ${ackIds.length} ingested candidates to web portal.`);
    } catch (ackErr) {
      console.warn("[Sync Worker] Failed to send ACK to school website:", ackErr.message);
    }
  }

  return { ok: true, ingested: ackIds.length };
}

/**
 * 2c. Outbound Push Classes to Website: Pushes authoritative class hierarchy and arms
 * to the connected school website so public applicants choose from exact school classes.
 */
async function pushClassesToWebsite() {
  const db = database.getDb();
  const schoolId = getSchoolId(db);
  if (!schoolId) return { ok: false, reason: "no_school_id" };

  const websiteUrl = getSchoolWebsiteUrl(db);
  if (!websiteUrl) {
    return { ok: true, skipped: true, reason: "no_school_website_url" };
  }

  let syncToken = "";
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'school_website_sync_token'").get();
    if (row && row.value) syncToken = row.value.trim();
  } catch (_) {}

  if (!syncToken) {
    syncToken = process.env.SCHOOL_WEBSITE_SYNC_TOKEN || getSyncToken(db);
  }

  try {
    const setting = db.prepare("SELECT value FROM system_settings WHERE key = 'class_hierarchy'").get();
    const hierarchy = setting ? JSON.parse(setting.value) : [];
    const configs = db.prepare("SELECT hierarchy_class, max_subjects, pass_mark_override FROM class_configs").all();
    const arms = db.prepare("SELECT hierarchy_class, arm FROM class_arms ORDER BY arm ASC").all();

    const armsMap = {};
    arms.forEach(r => {
      if (!armsMap[r.hierarchy_class]) armsMap[r.hierarchy_class] = [];
      armsMap[r.hierarchy_class].push(r.arm);
    });

    const configsMap = {};
    configs.forEach(c => {
      configsMap[c.hierarchy_class] = c;
    });

    const hierarchyPayload = hierarchy.filter(cls => configsMap[cls]).map(cls => {
      const c = configsMap[cls];
      return {
        hierarchyClass: cls,
        maxSubjects: c.max_subjects || 0,
        arms: armsMap[cls] || []
      };
    });

    const flatList = [];
    hierarchyPayload.forEach(item => {
      if (item.arms && item.arms.length > 0) {
        item.arms.forEach(arm => {
          const fullName = arm.startsWith(`${item.hierarchyClass} `) ? arm : `${item.hierarchyClass} ${arm}`;
          flatList.push(fullName);
        });
      } else {
        flatList.push(item.hierarchyClass);
      }
    });

    if (hierarchyPayload.length === 0 && flatList.length === 0) {
      return { ok: true, skipped: true, reason: "no_classes_configured" };
    }

    const res = await fetch(`${websiteUrl}/api/sync/classes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-token": syncToken,
      },
      body: JSON.stringify({
        schoolCloudId: schoolId,
        hierarchy: hierarchyPayload,
        fullList: flatList,
        source: "desktop_sync",
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[Sync Worker] Classes push returned HTTP ${res.status}: ${errText}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json().catch(() => ({}));
    console.log(`[Sync Worker] Successfully pushed ${flatList.length} classes to school website.`);
    return { ok: true, count: flatList.length };
  } catch (err) {
    console.warn("[Sync Worker] Failed to push classes to website:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Gathers a complete snapshot of local school data ready for staging, preview, and sync.
 */
async function gatherSyncPackage() {
  const db = database.getDb();
  const schoolId = getSchoolId(db);
  const websiteUrl = getSchoolWebsiteUrl(db);

  // 1. Classes & Hierarchy
  let hierarchy = [];
  let hierarchyPayload = [];
  let flatList = [];
  try {
    const setting = db.prepare("SELECT value FROM system_settings WHERE key = 'class_hierarchy'").get();
    hierarchy = setting ? JSON.parse(setting.value) : [];
    const configs = db.prepare("SELECT hierarchy_class, max_subjects, pass_mark_override FROM class_configs").all();
    const arms = db.prepare("SELECT hierarchy_class, arm FROM class_arms ORDER BY arm ASC").all();

    const armsMap = {};
    arms.forEach((r) => {
      if (!armsMap[r.hierarchy_class]) armsMap[r.hierarchy_class] = [];
      armsMap[r.hierarchy_class].push(r.arm);
    });

    const configsMap = {};
    configs.forEach((c) => {
      configsMap[c.hierarchy_class] = c;
    });

    hierarchyPayload = hierarchy
      .filter((cls) => configsMap[cls])
      .map((cls) => {
        const c = configsMap[cls];
        return {
          hierarchyClass: cls,
          maxSubjects: c.max_subjects || 0,
          arms: armsMap[cls] || [],
        };
      });

    hierarchyPayload.forEach((item) => {
      if (item.arms && item.arms.length > 0) {
        item.arms.forEach((arm) => {
          const fullName = arm.startsWith(`${item.hierarchyClass} `)
            ? arm
            : `${item.hierarchyClass} ${arm}`;
          flatList.push(fullName);
        });
      } else {
        flatList.push(item.hierarchyClass);
      }
    });
  } catch (err) {
    console.error("[Sync Worker] Error gathering classes for sync:", err);
  }

  // 2. School Profile & Branding
  let branding = {
    schoolName: "",
    motto: "",
    address: "",
    phone: "",
    email: "",
    primaryColor: "#0B3D2E",
    accentColor: "#D4AF37",
    logoUrl: null,
  };
  try {
    const getSetting = (key) => {
      const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
      return row ? row.value : "";
    };
    branding.schoolName = getSetting("school_name");
    branding.motto = getSetting("school_motto");
    branding.address = getSetting("school_address");
    branding.phone = getSetting("school_phone");
    branding.email = getSetting("school_email");

    const identityRow = db
      .prepare("SELECT value FROM app_settings WHERE key = 'school_identity'")
      .get();
    if (identityRow && identityRow.value) {
      try {
        const ident = JSON.parse(identityRow.value);
        if (ident.name) branding.schoolName = ident.name;
        if (ident.themePrimary) branding.primaryColor = ident.themePrimary;
        if (ident.themeSecondary) branding.accentColor = ident.themeSecondary;
        if (ident.logoBase64) branding.logoUrl = ident.logoBase64;
      } catch (_) {}
    }
  } catch (err) {
    console.error("[Sync Worker] Error gathering branding for sync:", err);
  }

  // 3. Academic Calendar & Session
  let calendar = {
    academicSession: "2026/2027",
    term: "First Term",
  };
  try {
    const sessRow = db
      .prepare("SELECT value FROM system_settings WHERE key = 'current_academic_session'")
      .get();
    if (sessRow && sessRow.value) calendar.academicSession = sessRow.value;
    const termRow = db.prepare("SELECT value FROM system_settings WHERE key = 'current_term'").get();
    if (termRow && termRow.value) calendar.term = termRow.value;
  } catch (err) {
    console.error("[Sync Worker] Error gathering calendar for sync:", err);
  }

  // 4. Fee Structures
  let fees = [];
  try {
    const rows = db
      .prepare("SELECT class_name, item_name, amount, term, is_optional FROM fee_structures")
      .all();
    fees = rows.map((r) => ({
      className: r.class_name,
      itemName: r.item_name,
      amount: r.amount,
      term: r.term,
      isOptional: Boolean(r.is_optional),
    }));
  } catch (err) {
    console.error("[Sync Worker] Error gathering fees for sync:", err);
  }

  // 5. Custom Subjects
  let customSubjects = [];
  try {
    const rows = db.prepare("SELECT name FROM custom_subjects").all();
    customSubjects = rows.map((r) => r.name).filter(Boolean);
  } catch (err) {
    console.error("[Sync Worker] Error gathering custom subjects for sync:", err);
  }

  // 6. Entrance & Online CBT Exams
  let cbtExams = [];
  try {
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cbt_exams'")
      .get();
    if (tableExists) {
      let rows = [];
      try {
        rows = db
          .prepare(
            "SELECT * FROM cbt_exams WHERE delivery_mode = 'online' OR exam_type = 'external'"
          )
          .all();
      } catch (colErr) {
        // Fallback if delivery_mode column hasn't migrated yet
        rows = db
          .prepare("SELECT * FROM cbt_exams WHERE exam_type = 'external'")
          .all();
      }

      cbtExams = rows.map((r) => {
        let targetClasses = [];
        try {
          targetClasses = r.target_classes ? JSON.parse(r.target_classes) : [];
        } catch (e) {
          targetClasses = [];
        }
        if (!Array.isArray(targetClasses) || targetClasses.length === 0) {
          targetClasses = r.class_name
            ? r.class_name.split(',').map((s) => s.trim()).filter(Boolean)
            : [];
        }

        let subjectQuotas = [];
        try {
          subjectQuotas = r.subject_quotas ? JSON.parse(r.subject_quotas) : [];
        } catch (e) {
          subjectQuotas = [];
        }

        let secProfile = {};
        try {
          secProfile = r.security_profile ? JSON.parse(r.security_profile) : {};
        } catch (e) {
          secProfile = {};
        }

        const enforceKiosk = Boolean(secProfile.kiosk);
        const enableProctoring =
          r.enable_proctoring !== undefined && r.enable_proctoring !== null
            ? Boolean(r.enable_proctoring)
            : Boolean(secProfile.proctoring);

        const calculatorType =
          r.calculator_type ||
          (secProfile.calculator
            ? secProfile.calculator_type || 'basic'
            : 'none');

        return {
          id: r.id,
          title: r.title,
          className:
            r.class_name ||
            (targetClasses.length > 0 ? targetClasses.join(', ') : 'All Classes'),
          targetClasses,
          academicSession: r.academic_session || '2026/2027',
          durationMinutes: r.duration_minutes || 45,
          questionCount: r.question_count || 40,
          passMarkPercentage: r.pass_mark_percentage || 50,
          passPercentage: r.pass_mark_percentage || 50,
          shuffleQuestions: r.shuffle_questions !== 0,
          shuffleOptions: r.shuffle_options !== 0,
          examType: r.exam_type === 'external' ? 'entrance' : (r.exam_type || 'entrance'),
          deliveryMode:
            r.delivery_mode || (r.exam_type === 'external' ? 'online' : 'on_premises'),
          isPromotional: Boolean(r.is_promotional),
          calculatorType,
          enableProctoring,
          enforceKiosk,
          resultReleasePolicy: r.result_release_policy || 'immediate',
          pcCount: r.pc_count ? Number(r.pc_count) : 30,
          autoIssueOffer:
            r.auto_issue_offer !== undefined && r.auto_issue_offer !== null
              ? Boolean(r.auto_issue_offer)
              : true,
          instructions: r.instructions || '',
          subjectQuotas,
        };
      });
    }
  } catch (err) {
    console.error("[Sync Worker] Error gathering CBT exams for sync:", err);
  }

  // 7. Question Banks & Questions (For Cloud Scheduling & Self-Serve Admissions)
  let cbtQuestionBanks = [];
  try {
    const banksTableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cbt_question_banks'")
      .get();
    if (banksTableExists) {
      const bankRows = db.prepare("SELECT * FROM cbt_question_banks ORDER BY created_at DESC").all();
      const questionStmt = db.prepare("SELECT * FROM cbt_questions WHERE bank_id = ? ORDER BY id ASC");

      cbtQuestionBanks = bankRows.map((b) => {
        let questions = [];
        try {
          questions = questionStmt.all(b.id).map((q) => {
            let hash = q.question_hash;
            if (!hash) {
              hash = crypto
                .createHash("sha256")
                .update(
                  (q.question_text || "").trim() +
                    (q.option_a || "").trim() +
                    (q.option_b || "").trim() +
                    (q.option_c || "").trim() +
                    (q.option_d || "").trim() +
                    (q.correct_option || "").trim().toUpperCase()
                )
                .digest("hex");
            }
            return {
              id: q.id,
              questionText: q.question_text,
              optionA: q.option_a,
              optionB: q.option_b,
              optionC: q.option_c,
              optionD: q.option_d,
              correctOption: (q.correct_option || "A").toUpperCase(),
              marks: q.marks || 1,
              difficulty: q.difficulty || "medium",
              questionHash: hash,
            };
          });
        } catch (qErr) {
          console.error(`[Sync Worker] Error reading questions for bank ${b.id}:`, qErr);
        }

        return {
          id: b.id,
          name: b.name,
          subject: b.subject || b.class_category || "General",
          classCategory: b.class_category || "General",
          description: b.description || "",
          isPremium: Boolean(b.is_premium),
          packId: b.pack_id || `local_bank_${b.id}`,
          questionCount: questions.length,
          questions,
        };
      });
    }
  } catch (err) {
    console.error("[Sync Worker] Error gathering CBT question banks for sync:", err);
  }

  return {
    ok: true,
    schoolCloudId: schoolId,
    websiteUrl,
    modules: {
      classes: {
        hierarchy: hierarchyPayload,
        fullList: flatList,
      },
      branding,
      calendar,
      fees,
      customSubjects,
      cbtExams,
      cbtQuestionBanks,
    },
  };
}

/**
 * Sends a vetted sync package to the school website (supports dryRun = true).
 */
async function dispatchSyncPackage(payload, options = {}) {
  const db = database.getDb();
  const schoolId = getSchoolId(db);
  if (!schoolId) return { ok: false, error: "no_school_id" };

  const websiteUrl = getSchoolWebsiteUrl(db);
  if (!websiteUrl) return { ok: false, error: "no_school_website_url" };

  let syncToken = "";
  try {
    const row = db
      .prepare("SELECT value FROM app_settings WHERE key = 'school_website_sync_token'")
      .get();
    if (row && row.value) syncToken = row.value.trim();
  } catch (_) {}

  if (!syncToken) {
    syncToken = process.env.SCHOOL_WEBSITE_SYNC_TOKEN || getSyncToken(db);
  }

  const dryRun = Boolean(options.dryRun);
  const targetEndpoint = `${websiteUrl}/api/sync/package`;

  const bodyData = {
    schoolCloudId: schoolId,
    dryRun,
    modules: payload?.modules || {},
  };

  const res = await fetch(targetEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sync-token": syncToken,
    },
    body: JSON.stringify(bodyData),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, error: data.error || `HTTP ${res.status}` };
  }

  return { ok: true, dryRun, impact: data.impact, message: data.message };
}

/**
 * 3. Full 2-Way Sync Loop Cycle
 */
async function performSyncCycle() {
  if (isSyncing) return;
  isSyncing = true;
  try {
    // 1. Inbound pull first: reconcile cloud events into local ledger
    const pullRes = await pullPendingSyncEvents();

    // 2. Inbound online admissions pull: ingest accepted web enrollments
    let admissionsRes = { ok: true, skipped: true };
    try {
      admissionsRes = await pullOnlineAdmissions();
    } catch (admErr) {
      console.warn("[Sync Worker] Online admissions pull error (non-fatal):", admErr.message);
    }

    // 2b. Outbound class roster sync: push current classes and arms to website
    try {
      await pushClassesToWebsite();
    } catch (clsErr) {
      console.warn("[Sync Worker] Classes push error (non-fatal):", clsErr.message);
    }

    // 3. Outbound push third: push fresh local state (including newly reconciled balances)
    const pushRes = await pushSchoolDelta();

    lastSyncSuccess = new Date().toISOString();
    lastSyncError = null;

    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send("sync:status", {
        status: "idle",
        lastSync: lastSyncSuccess,
        error: null
      });
    }
    return { ok: true, push: pushRes, pull: pullRes };
  } catch (err) {
    lastSyncError = err.message;
    console.warn("[Sync Worker] Sync cycle warning:", err.message);
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send("sync:status", {
        status: "error",
        lastSync: lastSyncSuccess,
        error: lastSyncError
      });
    }
    return { ok: false, error: err.message };
  } finally {
    isSyncing = false;
  }
}

function initSyncWorker(mainWindow) {
  mainWindowRef = mainWindow;
}

function startSyncSchedule(intervalMs = 5 * 60 * 1000) {
  const db = database.getDb();
  if (!isCloudEnabled(db)) {
    console.log("[Sync Worker] Cloud Pulse is disabled — sync schedule not started.");
    return;
  }

  if (syncTimer) clearInterval(syncTimer);
  // Run first cycle 10 seconds after app startup
  setTimeout(() => {
    performSyncCycle().catch(() => {});
  }, 10000);

  // Background interval every 5 minutes
  syncTimer = setInterval(() => {
    performSyncCycle().catch(() => {});
  }, intervalMs);
}

function stopSyncSchedule() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

// ── Cloud Bot QR Poll ─────────────────────────────────────────────────────
// After init-bot triggers the VPS, the VPS calls POST /api/pulse/qr-relay to
// store a 2-minute QR. We poll GET /api/pulse/qr-relay every 3 seconds and
// forward the QR to the renderer so the admin can scan without leaving the app.

let _qrPollTimer = null;
let _statusPollTimer = null;

function stopCloudPolls() {
  if (_qrPollTimer)     { clearInterval(_qrPollTimer);     _qrPollTimer = null; }
  if (_statusPollTimer) { clearInterval(_statusPollTimer); _statusPollTimer = null; }
}

function startCloudStatusPoll(schoolId, apiBase, token) {
  let attempts = 0;
  const MAX = 10; // 10 × 3s = 30s

  _statusPollTimer = setInterval(async () => {
    attempts++;
    if (attempts > MAX) {
      clearInterval(_statusPollTimer);
      _statusPollTimer = null;
      return;
    }
    try {
      const r    = await fetch(`${apiBase}/api/pulse/bot-status?school_id=${schoolId}`,
        { headers: { 'x-nexus-sync-token': token } });
      const json = await r.json();
      if (json.status === 'connected' || json.status === 'CONNECTED') {
        clearInterval(_statusPollTimer);
        _statusPollTimer = null;
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.webContents.send('cloud-pulse:connected');
          console.log('[Sync Worker] Cloud bot connected — sent cloud-pulse:connected to renderer.');
        }
      } else if (json.status === 'error' || json.status === 'ERROR' || json.status === 'disconnected' || json.status === 'DISCONNECTED') {
        clearInterval(_statusPollTimer);
        _statusPollTimer = null;
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.webContents.send('cloud-pulse:error', json.status);
          console.log('[Sync Worker] Cloud bot entered error/disconnected state:', json.status);
        }
      }
    } catch (_) {}
  }, 3000);
}

function startCloudQrPoll(db) {
  stopCloudPolls(); // cancel any previous poll cycle

  const schoolId = getSchoolId(db);
  const apiBase  = getApiBase();
  const token    = getSyncToken(db);

  if (!schoolId || !apiBase) {
    console.warn('[Sync Worker] Cannot start QR poll — missing school_id or apiBase.');
    return;
  }

  let attempts      = 0;
  let hadQr         = false; // true once we have seen at least one AWAITING_QR_SCAN
  const MAX_ATTEMPTS = 50;   // 50 × 3s ≈ 150s (slightly beyond 2-min QR TTL)
  // Skip the bot-status short-circuit for the first GRACE_TICKS ticks.
  // Chrome takes 5-15s to load WhatsApp Web and generate a QR after a fresh
  // session wipe. Without this grace period the poll can see a briefly-stale
  // CONNECTED status from the previous session during the destroy/recreate
  // window and stop before the QR is ever generated.
  const GRACE_TICKS = 5; // 5 × 3s = 15s

  console.log('[Sync Worker] Starting cloud QR poll for', schoolId);

  _qrPollTimer = setInterval(async () => {
    attempts++;
    if (attempts > MAX_ATTEMPTS) {
      clearInterval(_qrPollTimer);
      _qrPollTimer = null;
      console.log('[Sync Worker] QR poll timed out — QR was not scanned in time.');
      return;
    }
    try {
      // 1. Check if bot is already connected or errored — but only AFTER the grace period.
      //    During grace we go straight to the QR relay check so a stale
      //    status cannot prematurely stop the poll.
      if (attempts > GRACE_TICKS) {
        try {
          const sRes = await fetch(`${apiBase}/api/pulse/bot-status?school_id=${schoolId}`,
            { headers: { 'x-nexus-sync-token': token } });
          const sJson = await sRes.json();
          if (sJson.status === 'connected' || sJson.status === 'CONNECTED') {
            clearInterval(_qrPollTimer);
            _qrPollTimer = null;
            if (mainWindowRef && !mainWindowRef.isDestroyed()) {
              mainWindowRef.webContents.send('cloud-pulse:connected');
              console.log('[Sync Worker] Cloud bot already connected!');
            }
            return;
          }
          if (sJson.status === 'error' || sJson.status === 'ERROR' || sJson.status === 'disconnected' || sJson.status === 'DISCONNECTED') {
            clearInterval(_qrPollTimer);
            _qrPollTimer = null;
            if (mainWindowRef && !mainWindowRef.isDestroyed()) {
              mainWindowRef.webContents.send('cloud-pulse:error', sJson.status);
              console.log('[Sync Worker] Cloud bot error during QR poll:', sJson.status);
            }
            return;
          }
        } catch (_) {}
      }

      // 2. Poll QR relay
      const r    = await fetch(`${apiBase}/api/pulse/qr-relay?school_id=${schoolId}`,
        { headers: { 'x-nexus-sync-token': token } });
      const json = await r.json();

      if (json.status === 'AWAITING_QR_SCAN' && json.qr) {
        hadQr = true;
        let qrDataUrl = json.qr;
        if (!qrDataUrl.startsWith('data:image/')) {
          try {
            const QRCode = require('qrcode');
            qrDataUrl = await QRCode.toDataURL(json.qr);
          } catch (qrErr) {
            console.error('[Sync Worker] Failed to convert QR string to data URL:', qrErr);
          }
        }
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.webContents.send('cloud-pulse:qr', qrDataUrl);
        }
      }


      // Note: EXPIRED_OR_NONE alone does NOT mean the QR was scanned.
      // WhatsApp rotates QR codes every ~20s; the bot relays each new one with a
      // fresh 2-min TTL. Keep polling — the status check above (after GRACE_TICKS)
      // detects a real scan via 'connected' state, and MAX_ATTEMPTS caps the loop.

    } catch (_) {}
  }, 3000);
}

async function requestCloudBotInit(db) {
  const schoolId = getSchoolId(db);
  const apiBase  = getApiBase();
  const token    = getSyncToken(db);

  if (!schoolId || !apiBase) {
    console.warn('[Sync Worker] Cannot init cloud bot — missing school_id or apiBase.');
    return { ok: false, error: 'Missing School Cloud ID or API Base URL' };
  }

  console.log('[Sync Worker] Triggering POST /api/pulse/init-bot for', schoolId);
  try {
    const res = await fetch(`${apiBase}/api/pulse/init-bot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nexus-sync-token': token,
      },
      body: JSON.stringify({ school_id: schoolId }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.ok) {
      console.log('[Sync Worker] Cloud bot init triggered successfully — starting QR poll.');
      startCloudQrPoll(db);
      return { ok: true };
    } else {
      console.warn(`[Sync Worker] init-bot returned ${res.status}:`, json);
      return { ok: false, error: json.error || `HTTP ${res.status}` };
    }
  } catch (err) {
    console.warn('[Sync Worker] Bot init call failed:', err.message);
    return { ok: false, error: err.message };
  }
}

async function checkCloudBotStatus(db) {
  const schoolId = getSchoolId(db);
  const apiBase  = getApiBase();
  const token    = getSyncToken(db);
  if (!schoolId || !apiBase) return { status: 'offline' };
  try {
    const res = await fetch(`${apiBase}/api/pulse/bot-status?school_id=${schoolId}`,
      { headers: { 'x-nexus-sync-token': token } });
    return await res.json();
  } catch (_) {
    return { status: 'offline' };
  }
}

/**
 * Resets the cloud bot session (wipes VPS WhatsApp credentials) then
 * immediately triggers a fresh init so a new QR code is generated.
 * Called by the "Re-pair WhatsApp Number" button in the desktop app.
 */
async function requestCloudBotReset(db) {
  const schoolId = getSchoolId(db);
  const apiBase  = getApiBase();
  const token    = getSyncToken(db);

  if (!schoolId || !apiBase) {
    console.warn('[Sync Worker] Cannot reset cloud bot — missing school_id or apiBase.');
    return { ok: false, error: 'Missing School Cloud ID or API Base URL' };
  }

  console.log('[Sync Worker] Triggering POST /api/pulse/reset-session for', schoolId);
  try {
    const res = await fetch(`${apiBase}/api/pulse/reset-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nexus-sync-token': token },
      body: JSON.stringify({ school_id: schoolId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      const msg = json.error || `HTTP ${res.status}`;
      console.warn('[Sync Worker] reset-session failed:', msg);
      return { ok: false, error: msg };
    }
    console.log('[Sync Worker] Session reset OK — triggering fresh init + QR poll.');
    // Give the VPS 1 s to finish cleanup before launching the new session
    await new Promise(r => setTimeout(r, 1000));
    return requestCloudBotInit(db);
  } catch (err) {
    console.warn('[Sync Worker] Bot reset call failed:', err.message);
    return { ok: false, error: err.message };
  }
}

async function activateCloud(options = {}) {
  const db = database.getDb();
  const schoolCloudId = options.schoolCloudId || getSchoolId(db);

  if (!schoolCloudId) {
    throw new Error("Cannot activate Cloud Pulse without a valid School Cloud ID.");
  }

  db.prepare(`
    INSERT OR REPLACE INTO app_settings (key, value)
    VALUES ('cloud_pulse_enabled', 'true')
  `).run();

  if (options.schoolCloudId) {
    db.prepare(`
      INSERT OR REPLACE INTO app_settings (key, value)
      VALUES ('school_cloud_id', ?)
    `).run(options.schoolCloudId);
  }

  // Start sync timer
  startSyncSchedule();

  // Trigger VPS bot initialisation (fire-and-forget — failures don't block sync activation)
  requestCloudBotInit(db).catch((e) => console.warn('[Sync Worker] Auto-init bot warning:', e));

  // Run immediate sync cycle
  const result = await performSyncCycle();
  return { ok: true, syncResult: result };
}

async function deactivateCloud() {
  const db = database.getDb();
  db.prepare(`
    INSERT OR REPLACE INTO app_settings (key, value)
    VALUES ('cloud_pulse_enabled', 'false')
  `).run();

  stopSyncSchedule();

  // Tell the VPS to wipe the WhatsApp session — mirrors removing a linked device.
  // Does NOT call requestCloudBotInit() afterwards; the admin must scan a fresh QR
  // to reactivate, same as re-linking a device on WhatsApp.
  // Local deactivation always completes even if the VPS call fails.
  const schoolId = getSchoolId(db);
  const apiBase  = getApiBase();
  const token    = getSyncToken(db);

  if (schoolId && apiBase) {
    try {
      const res = await fetch(`${apiBase}/api/pulse/reset-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-nexus-sync-token': token
        },
        body: JSON.stringify({ school_id: schoolId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        console.warn('[Sync Worker] deactivateCloud: reset-session failed —', json.error || `HTTP ${res.status}`);
      } else {
        console.log('[Sync Worker] deactivateCloud: VPS session wiped for', schoolId);
      }
    } catch (err) {
      console.warn('[Sync Worker] deactivateCloud: reset-session call threw —', err.message);
    }
  } else {
    console.warn('[Sync Worker] deactivateCloud: no schoolId/apiBase — skipping VPS reset');
  }

  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send("sync:status", {
      status: "disabled",
      lastSync: lastSyncSuccess,
      error: null
    });
  }

  return { ok: true };
}

function getCloudConfig() {
  const db = database.getDb();
  return {
    isEnabled: isCloudEnabled(db),
    schoolCloudId: getSchoolId(db),
    isSyncing,
    lastSyncSuccess,
    lastSyncError
  };
}

function getSyncStatus() {
  return {
    isSyncing,
    lastSyncSuccess,
    lastSyncError
  };
}

/**
 * Register a callback invoked when a PAYMENT_SETTLED cloud event is pulled.
 * Called from main.js with processSuccessfulPayment so the full settlement
 * (fee_transactions + student_fees + WhatsApp receipt) runs on cloud payments.
 * Must be registered BEFORE the first sync cycle fires.
 */
function registerPaymentSettledHandler(fn) {
  _onPaymentSettled = fn;
}

module.exports = {
  initSyncWorker,
  registerPaymentSettledHandler,
  pushSchoolDelta,
  pullPendingSyncEvents,
  pullOnlineAdmissions,
  pushClassesToWebsite,
  gatherSyncPackage,
  dispatchSyncPackage,
  performSyncCycle,
  startSyncSchedule,
  stopSyncSchedule,
  activateCloud,
  deactivateCloud,
  getCloudConfig,
  getSyncStatus,
  startCloudQrPoll,
  requestCloudBotInit,
  requestCloudBotReset,
  checkCloudBotStatus,
};


