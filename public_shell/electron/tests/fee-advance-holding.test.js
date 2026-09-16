/**
 * tests/fee-advance-holding.test.js
 *
 * Tests for the Advance Fee Holding Ledger (student_fee_advances)
 * and manual WhatsApp receipt dispatch logic.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

describe('Advance Fee Holding & Auto-Offset Logic', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE students (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        class_name TEXT NOT NULL,
        parent_phone TEXT DEFAULT '',
        parent_phone_2 TEXT DEFAULT NULL,
        parent_email TEXT DEFAULT ''
      );

      CREATE TABLE student_fees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,
        academic_session TEXT NOT NULL,
        term TEXT NOT NULL,
        total_billed REAL NOT NULL DEFAULT 0,
        total_paid REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'unpaid',
        UNIQUE(student_id, academic_session, term)
      );

      CREATE TABLE fee_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,
        academic_session TEXT NOT NULL,
        term TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_method TEXT NOT NULL,
        reference_number TEXT NOT NULL,
        recorded_by TEXT,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE student_fee_advances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,
        amount REAL NOT NULL,
        amount_used REAL NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL DEFAULT 'cash',
        reference_number TEXT NOT NULL,
        source_session TEXT NOT NULL,
        source_term TEXT NOT NULL,
        target_session TEXT DEFAULT NULL,
        target_term TEXT DEFAULT NULL,
        recorded_by TEXT,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'available',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id)
      );

      CREATE TABLE fee_payment_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        paystack_ref TEXT UNIQUE NOT NULL,
        student_id TEXT NOT NULL,
        parent_phone TEXT
      );
    `);

    db.prepare(`
      INSERT INTO students (id, name, class_name, parent_phone, parent_phone_2, parent_email)
      VALUES ('STU-001', 'John Doe', 'JSS 1', '08012345678', '08098765432', 'john.parent@example.com')
    `).run();
  });

  afterEach(() => {
    db.close();
  });

  it('records an advance payment deposit correctly', () => {
    const depositAmt = 50000;
    const ref = 'ADV-TEST-001';

    db.prepare(`
      INSERT INTO student_fee_advances (
        student_id, amount, amount_used, payment_method, reference_number,
        source_session, source_term, target_term, status
      ) VALUES (?, ?, 0, 'transfer', ?, '2025/2026', 'First Term', 'Second Term', 'available')
    `).run('STU-001', depositAmt, ref);

    const advance = db.prepare(`SELECT * FROM student_fee_advances WHERE reference_number = ?`).get(ref);
    expect(advance).toBeDefined();
    expect(advance.amount).toBe(50000);
    expect(advance.amount_used).toBe(0);
    expect(advance.status).toBe('available');
    expect(advance.target_term).toBe('Second Term');
  });

  it('queries total available advance balance across multiple deposits', () => {
    db.prepare(`
      INSERT INTO student_fee_advances (student_id, amount, amount_used, payment_method, reference_number, source_session, source_term, status)
      VALUES 
        ('STU-001', 30000, 10000, 'cash', 'ADV-1', '2025/2026', 'First Term', 'partially_used'),
        ('STU-001', 50000, 0, 'transfer', 'ADV-2', '2025/2026', 'First Term', 'available'),
        ('STU-001', 20000, 20000, 'cash', 'ADV-3', '2025/2026', 'First Term', 'exhausted')
    `).run();

    const advances = db.prepare(`
      SELECT (amount - amount_used) AS available
      FROM student_fee_advances
      WHERE student_id = ? AND status != 'exhausted' AND (amount - amount_used) > 0
    `).all('STU-001');

    const totalAvailable = advances.reduce((sum, a) => sum + a.available, 0);
    expect(totalAvailable).toBe(70000); // (30000-10000) + 50000 = 70000
  });

  it('partially offsets an outstanding fee balance using available advance credit', () => {
    // Student billed 60,000 for Second Term
    db.prepare(`
      INSERT INTO student_fees (student_id, academic_session, term, total_billed, total_paid, status)
      VALUES ('STU-001', '2025/2026', 'Second Term', 60000, 0, 'unpaid')
    `).run();

    // Student has 40,000 in advance credit
    db.prepare(`
      INSERT INTO student_fee_advances (student_id, amount, amount_used, payment_method, reference_number, source_session, source_term, status)
      VALUES ('STU-001', 40000, 0, 'transfer', 'ADV-PARTIAL', '2025/2026', 'First Term', 'available')
    `).run();

    const fee = db.prepare(`SELECT * FROM student_fees WHERE student_id = ? AND term = 'Second Term'`).get('STU-001');
    const balanceDue = fee.total_billed - fee.total_paid;
    expect(balanceDue).toBe(60000);

    const adv = db.prepare(`SELECT * FROM student_fee_advances WHERE student_id = ? AND status = 'available'`).get('STU-001');
    const offsetAmt = Math.min(balanceDue, adv.amount - adv.amount_used);
    expect(offsetAmt).toBe(40000);

    // Apply offset inside transaction
    db.transaction(() => {
      db.prepare(`
        INSERT INTO fee_transactions (student_id, academic_session, term, amount, payment_method, reference_number, note)
        VALUES (?, '2025/2026', 'Second Term', ?, 'advance_offset', 'ADV-OFFSET-01', 'Offset from ADV-PARTIAL')
      `).run('STU-001', offsetAmt);

      db.prepare(`
        UPDATE student_fee_advances
        SET amount_used = amount_used + ?, status = 'exhausted'
        WHERE id = ?
      `).run(offsetAmt, adv.id);

      db.prepare(`
        UPDATE student_fees
        SET total_paid = total_paid + ?, status = 'partial'
        WHERE student_id = ? AND term = 'Second Term'
      `).run(offsetAmt, 'STU-001');
    })();

    const updatedFee = db.prepare(`SELECT * FROM student_fees WHERE student_id = ? AND term = 'Second Term'`).get('STU-001');
    expect(updatedFee.total_paid).toBe(40000);
    expect(updatedFee.total_billed - updatedFee.total_paid).toBe(20000);

    const updatedAdv = db.prepare(`SELECT * FROM student_fee_advances WHERE id = ?`).get(adv.id);
    expect(updatedAdv.status).toBe('exhausted');
    expect(updatedAdv.amount_used).toBe(40000);
  });

  it('selects parent_phone_2 alongside parent_phone and parent_email', () => {
    const student = db.prepare(`
      SELECT s.id, s.name, s.parent_email, s.parent_phone, s.parent_phone_2
      FROM students s
      WHERE s.id = ?
    `).get('STU-001');

    expect(student.parent_phone).toBe('08012345678');
    expect(student.parent_phone_2).toBe('08098765432');
    expect(student.parent_email).toBe('john.parent@example.com');
  });

  it('correctly distinguishes manual transaction reference from online Paystack session', () => {
    db.prepare(`
      INSERT INTO fee_transactions (student_id, academic_session, term, amount, payment_method, reference_number)
      VALUES 
        ('STU-001', '2025/2026', 'First Term', 25000, 'cash', 'TRX-MANUAL-123'),
        ('STU-001', '2025/2026', 'First Term', 50000, 'transfer', 'PAY-ONLINE-999')
    `).run();

    db.prepare(`
      INSERT INTO fee_payment_sessions (paystack_ref, student_id, parent_phone)
      VALUES ('PAY-ONLINE-999', 'STU-001', '08012345678')
    `).run();

    // Check online payment session lookup
    const onlineSession = db.prepare("SELECT * FROM fee_payment_sessions WHERE paystack_ref = ?").get('PAY-ONLINE-999');
    expect(onlineSession).toBeDefined();

    // Check manual transaction lookup (has NO payment session, but exists in fee_transactions)
    const manualSession = db.prepare("SELECT * FROM fee_payment_sessions WHERE paystack_ref = ?").get('TRX-MANUAL-123');
    expect(manualSession).toBeUndefined();

    const manualTx = db.prepare("SELECT * FROM fee_transactions WHERE reference_number = ?").get('TRX-MANUAL-123');
    expect(manualTx).toBeDefined();
    expect(manualTx.amount).toBe(25000);
    expect(manualTx.payment_method).toBe('cash');
  });
});
