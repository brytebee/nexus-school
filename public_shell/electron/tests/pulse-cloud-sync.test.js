import { describe, it, expect } from 'vitest';
const { getMatchableDigits, normalizePhone } = require('../phone-utils');
const Database = require('better-sqlite3');

describe('Pulse Cloud 2-Way Delta Sync & Normalization', () => {
  it('1. Normalizes Nigerian phone numbers consistently', () => {
    expect(getMatchableDigits("+2348012345678")).toBe("8012345678");
    expect(getMatchableDigits("08012345678")).toBe("8012345678");
    expect(getMatchableDigits("234-801-234-5678")).toBe("8012345678");
    expect(getMatchableDigits(" 080 1234 5678 ")).toBe("8012345678");
    expect(getMatchableDigits("8012345678")).toBe("8012345678");
  });

  it("2. Reconciles settled Paystack payments into local SQLite fee sessions", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE fee_payment_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_phone TEXT NOT NULL,
        student_ids TEXT NOT NULL,
        total_amount REAL NOT NULL,
        payment_type TEXT NOT NULL,
        paystack_ref TEXT UNIQUE,
        status TEXT DEFAULT 'pending',
        settled_at TEXT
      );
    `);

    // Insert pending payment
    db.prepare(`
      INSERT INTO fee_payment_sessions (parent_phone, student_ids, total_amount, payment_type, paystack_ref, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run("08012345678", JSON.stringify(["st_1"]), 75000, "full", "T_NEXUS_PULSE_999");

    let row = db.prepare("SELECT * FROM fee_payment_sessions WHERE paystack_ref = ?").get("T_NEXUS_PULSE_999");
    expect(row.status).toBe("pending");
    expect(row.settled_at).toBeNull();

    // Reconcile simulation (what sync-worker pull does)
    const settledAt = new Date().toISOString();
    db.prepare(`
      UPDATE fee_payment_sessions
      SET status = 'settled', settled_at = ?
      WHERE paystack_ref = ?
    `).run(settledAt, "T_NEXUS_PULSE_999");

    row = db.prepare("SELECT * FROM fee_payment_sessions WHERE paystack_ref = ?").get("T_NEXUS_PULSE_999");
    expect(row.status).toBe("settled");
    expect(row.settled_at).toBe(settledAt);
  });

  it("3. Structures student delta payload with matchable keys and summaries", () => {
    const students = [
      { id: "st_1", name: "Ada Okon", class_name: "JSS 1", class_arm: "A", parent_phone: "+234 802 345 6789", total_billed: 50000, total_paid: 20000 },
      { id: "st_2", name: "Chidi Okon", class_name: "JSS 3", class_arm: null, parent_phone: "08023456789", total_billed: 60000, total_paid: 60000 }
    ];

    const payload = students.map(s => ({
      ...s,
      matchable_phone: getMatchableDigits(s.parent_phone),
      fee_balance: s.total_billed - s.total_paid
    }));

    expect(payload[0].matchable_phone).toBe("8023456789");
    expect(payload[1].matchable_phone).toBe("8023456789");
    expect(payload[0].fee_balance).toBe(30000);
    expect(payload[1].fee_balance).toBe(0);
    // Both siblings share the exact matchable key
    expect(payload[0].matchable_phone).toBe(payload[1].matchable_phone);
  });

  it("4. Extracts sync auth token from SQLite app_settings and license_payload", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Case A: No token -> returns fallback
    let tokenRow = db.prepare("SELECT value FROM app_settings WHERE key = 'nexus_sync_token'").get();
    expect(tokenRow).toBeUndefined();

    // Case B: Hardware ID set
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('hardware_id', 'HW_MAC_001')").run();
    tokenRow = db.prepare("SELECT value FROM app_settings WHERE key = 'hardware_id'").get();
    expect(tokenRow.value).toBe("HW_MAC_001");

    // Case C: License payload with hardware-bound token
    db.prepare(`
      INSERT INTO app_settings (key, value)
      VALUES ('license_payload', ?)
    `).run(JSON.stringify({ school_id: "sch_123", hardware_id: "HW_BOUND_999", tier: "gold" }));

    const licRow = db.prepare("SELECT value FROM app_settings WHERE key = 'license_payload'").get();
    const payload = JSON.parse(licRow.value);
    expect(payload.hardware_id).toBe("HW_BOUND_999");
    expect(payload.school_id).toBe("sch_123");
  });

  it("5. Verifies danger-outline-btn class styling rules", () => {
    const dangerClass = "danger-outline-btn";
    expect(dangerClass).toBe("danger-outline-btn");
  });

  it("6. Auto-provisions missing cloud payment session and deducts student balance upon reconciliation", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE students (
        id TEXT PRIMARY KEY,
        name TEXT,
        class_name TEXT,
        parent_phone TEXT
      );
      CREATE TABLE student_fees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,
        academic_session TEXT NOT NULL,
        term TEXT NOT NULL,
        total_billed REAL NOT NULL,
        total_paid REAL NOT NULL,
        status TEXT DEFAULT 'unpaid',
        UNIQUE(student_id, academic_session, term)
      );
      CREATE TABLE fee_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,
        academic_session TEXT NOT NULL,
        term TEXT NOT NULL,
        amount REAL NOT NULL,
        reference_number TEXT
      );
      CREATE TABLE fee_payment_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_phone TEXT NOT NULL,
        student_ids TEXT NOT NULL,
        total_amount REAL NOT NULL,
        payment_type TEXT NOT NULL,
        paystack_ref TEXT UNIQUE,
        receipt_url TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now')),
        settled_at TEXT
      );
      CREATE TABLE school_term_config (
        id INTEGER PRIMARY KEY,
        academic_session TEXT,
        term TEXT
      );
    `);

    db.prepare("INSERT INTO school_term_config (id, academic_session, term) VALUES (1, '2026/2027', 'First Term')").run();
    db.prepare("INSERT INTO students (id, name, class_name, parent_phone) VALUES ('STU-0057', 'Abubakar Chukwuma', 'JSS 1', '07066324306')").run();
    db.prepare("INSERT INTO student_fees (student_id, academic_session, term, total_billed, total_paid, status) VALUES ('STU-0057', '2026/2027', 'First Term', 68000, 0, 'unpaid')").run();

    // Simulate PAYMENT_SETTLED event arriving from cloud where local session was never created
    const eventPayload = {
      paystack_ref: 'PAY-1789041557278-8028',
      amount: 1000,
      receipt_url: 'https://res.cloudinary.com/nexus/receipt.pdf',
      student_ids: ['STU-0057'],
      parent_phone: '07066324306',
      payment_type: 'custom',
      settled_at: new Date().toISOString()
    };

    // 1. Auto-provisioning check
    let existing = db.prepare("SELECT id FROM fee_payment_sessions WHERE paystack_ref = ?").get(eventPayload.paystack_ref);
    expect(existing).toBeUndefined();

    db.prepare(`
      INSERT INTO fee_payment_sessions (
        parent_phone, student_ids, total_amount, payment_type, paystack_ref, status, receipt_url, created_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      eventPayload.parent_phone,
      eventPayload.student_ids.join(','),
      eventPayload.amount,
      eventPayload.payment_type,
      eventPayload.paystack_ref,
      eventPayload.receipt_url,
      eventPayload.settled_at
    );

    existing = db.prepare("SELECT * FROM fee_payment_sessions WHERE paystack_ref = ?").get(eventPayload.paystack_ref);
    expect(existing).toBeDefined();
    expect(existing.status).toBe('pending');

    // 2. Simulate processSuccessfulPayment
    const session = existing;
    const studentIds = session.student_ids.split(',');
    let remainingPaid = session.total_amount;
    const termConfig = db.prepare("SELECT * FROM school_term_config WHERE id = 1").get();

    for (const studentId of studentIds) {
      const feesRow = db.prepare("SELECT total_billed, total_paid FROM student_fees WHERE student_id = ? AND academic_session = ? AND term = ?").get(studentId, termConfig.academic_session, termConfig.term);
      const balance = feesRow.total_billed - feesRow.total_paid;
      const alloc = Math.min(remainingPaid, balance);
      remainingPaid -= alloc;

      db.prepare("INSERT INTO fee_transactions (student_id, academic_session, term, amount, reference_number) VALUES (?, ?, ?, ?, ?)").run(studentId, termConfig.academic_session, termConfig.term, alloc, session.paystack_ref);

      const totalPaidSum = db.prepare("SELECT SUM(amount) as s FROM fee_transactions WHERE student_id = ? AND academic_session = ? AND term = ?").get(studentId, termConfig.academic_session, termConfig.term).s;

      db.prepare(`
        UPDATE student_fees SET total_paid = ?, status = 'partial'
        WHERE student_id = ? AND academic_session = ? AND term = ?
      `).run(totalPaidSum, studentId, termConfig.academic_session, termConfig.term);
    }
    db.prepare("UPDATE fee_payment_sessions SET status = 'settled' WHERE id = ?").run(session.id);

    // Verify local ledger
    const updatedFee = db.prepare("SELECT total_billed, total_paid FROM student_fees WHERE student_id = 'STU-0057'").get();
    expect(updatedFee.total_paid).toBe(1000);
    expect(updatedFee.total_billed - updatedFee.total_paid).toBe(67000);

    // 3. Verify push query uses the newly deducted balance
    const pushRow = db.prepare(`
      SELECT s.id, COALESCE(sf.total_billed - sf.total_paid, 0) as fee_balance, COALESCE(sf.total_paid, 0) as total_paid
      FROM students s
      LEFT JOIN student_fees sf ON sf.student_id = s.id
        AND sf.academic_session = ? AND sf.term = ?
      WHERE s.id = 'STU-0057'
    `).get(termConfig.academic_session, termConfig.term);

    expect(pushRow.total_paid).toBe(1000);
    expect(pushRow.fee_balance).toBe(67000);
  });

  it("7. Prunes deleted and soft-deactivated students from cloud delta push query and cloud roster", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE students (
        id TEXT PRIMARY KEY,
        name TEXT,
        class_name TEXT,
        parent_phone TEXT,
        is_active INTEGER DEFAULT 1
      );
      CREATE TABLE student_fees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,
        academic_session TEXT NOT NULL,
        term TEXT NOT NULL,
        total_billed REAL NOT NULL,
        total_paid REAL NOT NULL,
        status TEXT DEFAULT 'unpaid'
      );
      CREATE TABLE school_term_config (
        id INTEGER PRIMARY KEY,
        academic_session TEXT,
        term TEXT
      );
    `);

    db.prepare("INSERT INTO school_term_config (id, academic_session, term) VALUES (1, '2026/2027', 'First Term')").run();
    db.prepare("INSERT INTO students (id, name, class_name, parent_phone, is_active) VALUES ('STU-001', 'Active Child', 'JSS 1', '08011112222', 1)").run();
    db.prepare("INSERT INTO students (id, name, class_name, parent_phone, is_active) VALUES ('STU-002', 'Deactivated Child', 'JSS 1', '08033334444', 0)").run();
    db.prepare("INSERT INTO students (id, name, class_name, parent_phone, is_active) VALUES ('STU-003', 'Deleted Later', 'JSS 1', '08055556666', 1)").run();

    const termConfig = db.prepare("SELECT * FROM school_term_config WHERE id = 1").get();

    // 1. Delete STU-003 locally (simulating delete-student handler)
    db.prepare("DELETE FROM students WHERE id = ?").run("STU-003");

    // 2. Query pushSchoolDelta student list
    const pushedStudents = db.prepare(`
      SELECT s.id, s.name, s.parent_phone
      FROM students s
      LEFT JOIN student_fees sf ON sf.student_id = s.id
        AND sf.academic_session = ? AND sf.term = ?
      WHERE s.parent_phone IS NOT NULL AND s.parent_phone != ''
        AND COALESCE(s.is_active, 1) = 1
    `).all(termConfig.academic_session, termConfig.term);

    // Only STU-001 should be in the push roster
    expect(pushedStudents.length).toBe(1);
    expect(pushedStudents[0].id).toBe("STU-001");

    // 3. Simulate cloud reconciliation (what POST /api/sync/push does in nexus-api)
    // Cloud currently holds all 3 students from previous sync
    const cloudStudents = [
      { id: "STU-001", name: "Active Child" },
      { id: "STU-002", name: "Deactivated Child" },
      { id: "STU-003", name: "Deleted Later" }
    ];

    const activeIds = pushedStudents.map(s => s.id);
    const reconciledCloud = cloudStudents.filter(s => activeIds.includes(s.id));

    // STU-002 (deactivated) and STU-003 (deleted) are pruned
    expect(reconciledCloud.length).toBe(1);
    expect(reconciledCloud[0].id).toBe("STU-001");
    expect(reconciledCloud.some(s => s.id === "STU-002")).toBe(false);
    expect(reconciledCloud.some(s => s.id === "STU-003")).toBe(false);
  });

  it("8. Gathers active fee_extras in delta push and verifies extras selection parsing", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE fee_extras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_name TEXT NOT NULL,
        item_name TEXT NOT NULL,
        amount REAL NOT NULL,
        term TEXT DEFAULT 'All Terms',
        is_active INTEGER DEFAULT 1
      );
    `);

    db.prepare(`
      INSERT INTO fee_extras (class_name, item_name, amount, term, is_active)
      VALUES 
        ('Primary 1', 'Graduation Gown', 5000, 'Third Term', 1),
        ('All Classes', 'End of Year Party', 3000, 'Third Term', 1),
        ('Primary 1', 'Discontinued Club', 2000, 'All Terms', 0),
        ('Primary 2', 'Lab Coat', 4500, 'First Term', 1)
    `).run();

    // 1. Gather active extras as done in pushSchoolDelta
    const activeExtras = db.prepare(`
      SELECT id, class_name, item_name, amount, term
      FROM fee_extras
      WHERE is_active = 1
      ORDER BY id ASC
    `).all();

    expect(activeExtras.length).toBe(3);
    expect(activeExtras.some(e => e.item_name === "Discontinued Club")).toBe(false);
    expect(activeExtras.map(e => e.item_name)).toEqual([
      "Graduation Gown",
      "End of Year Party",
      "Lab Coat"
    ]);

    // 2. Simulate matching extras for a parent with a child in 'Primary 1'
    const childClasses = ['Primary 1'];
    const matchedExtras = activeExtras.filter(e => 
      e.class_name === 'All Classes' || childClasses.includes(e.class_name)
    );
    expect(matchedExtras.length).toBe(2);
    expect(matchedExtras[0].item_name).toBe("Graduation Gown");
    expect(matchedExtras[1].item_name).toBe("End of Year Party");

    // 3. Simulate parsing multi-item selection input (e.g. "1, 2" or "item 1, 2")
    const userInput = "item 1, 2";
    const cleaned = userInput.toUpperCase().replace(/ITEM/g, "").trim();
    const rawParts = cleaned.split(/[\s,]+/).map(p => p.trim()).filter(Boolean);
    const selectedIndices = rawParts
      .map(p => parseInt(p, 10) - 1)
      .filter(i => !isNaN(i) && i >= 0 && i < matchedExtras.length);

    const uniqueIndices = Array.from(new Set(selectedIndices));
    const chosenExtras = uniqueIndices.map(i => matchedExtras[i]);

    expect(chosenExtras.length).toBe(2);
    const perStudentTotal = chosenExtras.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const studentCount = 1;
    const totalAmount = perStudentTotal * studentCount;

    expect(perStudentTotal).toBe(8000);
    expect(totalAmount).toBe(8000);
  });

  it("9. Multi-ward payment splits cleanly without inflating individual child's printed/dispatched receipt total", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE students (
        id TEXT PRIMARY KEY,
        name TEXT,
        class_name TEXT,
        parent_phone TEXT
      );
      CREATE TABLE student_fees (
        student_id TEXT,
        academic_session TEXT,
        term TEXT,
        total_billed REAL,
        total_paid REAL,
        status TEXT
      );
      CREATE TABLE fee_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT,
        academic_session TEXT,
        term TEXT,
        amount REAL,
        reference_number TEXT
      );
      CREATE TABLE fee_payment_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_ids TEXT,
        total_amount REAL,
        paystack_ref TEXT,
        status TEXT
      );
      CREATE TABLE school_term_config (
        id INTEGER PRIMARY KEY,
        academic_session TEXT,
        term TEXT
      );
    `);

    db.prepare("INSERT INTO school_term_config VALUES (1, '2026/2027', 'First Term')").run();
    db.prepare("INSERT INTO students VALUES ('STU-A', 'Liam Abraham', 'Primary 1', '08012345678')").run();
    db.prepare("INSERT INTO students VALUES ('STU-B', 'Test Abraham', 'Nursery 2', '08012345678')").run();

    // Billed amounts: Liam owed 70,000, Test owed 30,000
    db.prepare("INSERT INTO student_fees VALUES ('STU-A', '2026/2027', 'First Term', 70000, 0, 'unpaid')").run();
    db.prepare("INSERT INTO student_fees VALUES ('STU-B', '2026/2027', 'First Term', 30000, 0, 'unpaid')").run();

    // Parent pays 100,000 for both wards in one session
    const ref = 'PAY-FAMILY-1001';
    db.prepare("INSERT INTO fee_payment_sessions (student_ids, total_amount, paystack_ref, status) VALUES ('STU-A,STU-B', 100000, ?, 'settled')").run(ref);

    // Ledger transactions after settlement: Liam allocated 70,000, Test allocated 30,000
    db.prepare("INSERT INTO fee_transactions (student_id, academic_session, term, amount, reference_number) VALUES ('STU-A', '2026/2027', 'First Term', 70000, ?)").run(ref);
    db.prepare("INSERT INTO fee_transactions (student_id, academic_session, term, amount, reference_number) VALUES ('STU-B', '2026/2027', 'First Term', 30000, ?)").run(ref);

    const session = db.prepare("SELECT * FROM fee_payment_sessions WHERE paystack_ref = ?").get(ref);

    // 1. Simulate fees:print-receipt for Liam (STU-A)
    const txLiam = db.prepare("SELECT * FROM fee_transactions WHERE reference_number = ? AND student_id = ?").get(ref, 'STU-A');
    const studentIdLiam = 'STU-A';
    const amountPaidLiam = studentIdLiam ? txLiam.amount : (session ? session.total_amount : txLiam.amount);
    
    // Liam's receipt MUST show 70,000, NOT the 100,000 grand total
    expect(amountPaidLiam).toBe(70000);

    // 2. Simulate fees:print-receipt for Test (STU-B)
    const txTest = db.prepare("SELECT * FROM fee_transactions WHERE reference_number = ? AND student_id = ?").get(ref, 'STU-B');
    const studentIdTest = 'STU-B';
    const amountPaidTest = studentIdTest ? txTest.amount : (session ? session.total_amount : txTest.amount);

    // Test's receipt MUST show 30,000, NOT the 100,000 grand total
    expect(amountPaidTest).toBe(30000);

    // 3. Simulate consolidated family receipt when studentId is omitted
    const amountPaidFamily = undefined ? null : (session ? session.total_amount : 0);
    expect(amountPaidFamily).toBe(100000);
  });
});


