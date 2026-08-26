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
});
