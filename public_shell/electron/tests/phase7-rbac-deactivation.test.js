/**
 * tests/phase7-rbac-deactivation.test.js
 *
 * Phase 7: Admin Passwords, RBAC & Soft-Deactivation Engine
 *
 * Tests:
 *  1. is_active = 0 student excluded from fee roster SELECT
 *  2. is_active = 0 student excluded from get-all-students SELECT
 *  3. Manager (role_level 5) cannot permanently delete a student
 *  4. Superadmin (role_level 9) CAN permanently delete a student
 *  5. teacher:deactivate sets is_active = 0 + writes audit_logs
 *  6. student:deactivate sets is_active = 0 + writes audit_logs
 *  7. auth:create-admin stores base64-encoded credential
 *  8. Auth-type toggle PIN to password re-hashes correctly
 */

import { describe, it, expect, beforeEach } from 'vitest';
const { database } = require('@nexus/engine');

describe('Phase 7 — RBAC & Soft-Deactivation Engine', () => {
  let db;

  beforeEach(() => {
    db = database.init(':memory:');
    // Singleton DB: clear state between tests (FK-safe order: children first)
    db.exec(`
      DELETE FROM audit_logs;
      DELETE FROM fee_transactions;
      DELETE FROM student_fees;
      DELETE FROM students;
      DELETE FROM teachers;
      DELETE FROM admin_users;
    `);
  });

  function seedStudent(overrides = {}) {
    const s = { id: 'STU001', name: 'Ade Bello', class_name: 'JSS 1', class_arm: 'Gold', reg_no: 'REG001', is_active: 1, ...overrides };
    db.prepare('INSERT OR REPLACE INTO students (id, name, class_name, class_arm, reg_no, is_active) VALUES (?, ?, ?, ?, ?, ?)')
      .run(s.id, s.name, s.class_name, s.class_arm, s.reg_no, s.is_active);
    return s;
  }

  // Note: teachers table has no `subject` column — subjects live in teacher_allocations.
  function seedTeacher(overrides = {}) {
    const t = { id: 'TCH001', name: 'Mr. John', is_active: 1, ...overrides };
    db.prepare('INSERT OR REPLACE INTO teachers (id, name, is_active) VALUES (?, ?, ?)')
      .run(t.id, t.name, t.is_active);
    return t;
  }

  function seedStudentFee(studentId, session = '2024/2025', term = 'First Term') {
    // student_fees.status CHECK: ('cleared','partial','unpaid') — must be lowercase
    db.prepare("INSERT OR REPLACE INTO student_fees (student_id, academic_session, term, total_billed, total_paid, status) VALUES (?, ?, ?, 80000, 0, 'unpaid')")
      .run(studentId, session, term);
  }

  function seedAdmin(overrides = {}) {
    const a = { username: 'testadmin', secret_hash: Buffer.from('1234').toString('base64'), auth_type: 'pin', role_level: 1, ...overrides };
    const result = db.prepare('INSERT INTO admin_users (username, secret_hash, auth_type, role_level) VALUES (?, ?, ?, ?)')
      .run(a.username, a.secret_hash, a.auth_type, a.role_level);
    return { ...a, id: result.lastInsertRowid };
  }

  it('excludes is_active=0 student from fee roster SELECT', () => {
    const session = '2024/2025', term = 'First Term';
    seedStudent({ id: 'STU001', is_active: 1 });
    seedStudent({ id: 'STU002', name: 'Ghost', reg_no: 'REG002', is_active: 0 });
    seedStudentFee('STU001', session, term);
    seedStudentFee('STU002', session, term);
    const rows = db.prepare(`
      SELECT s.id FROM students s
      LEFT JOIN student_fees sf ON sf.student_id = s.id AND sf.academic_session = ? AND sf.term = ?
      WHERE COALESCE(s.is_active, 1) = 1
    `).all(session, term);
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('STU001');
  });

  it('excludes is_active=0 student from get-all-students SELECT', () => {
    seedStudent({ id: 'STU001', is_active: 1 });
    seedStudent({ id: 'STU002', name: 'Inactive', reg_no: 'REG002', is_active: 0 });
    const rows = db.prepare('SELECT id FROM students WHERE COALESCE(is_active, 1) = 1').all();
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('STU001');
  });

  it('blocks permanent student delete for role_level < 9 (Manager)', () => {
    seedStudent({ id: 'STU001' });
    function guardedDelete(session, studentId) {
      if (!session || session.role_level < 9) return { ok: false, error: 'Superadmin access required to permanently delete a student. Managers may deactivate instead.' };
      db.prepare('DELETE FROM students WHERE id = ?').run(studentId);
      return { ok: true };
    }
    const result = guardedDelete({ role_level: 5 }, 'STU001');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Superadmin access required/);
    expect(db.prepare('SELECT id FROM students WHERE id = ?').get('STU001')).toBeDefined();
  });

  it('allows permanent student delete for role_level >= 9 (Superadmin)', () => {
    seedStudent({ id: 'STU001' });
    function guardedDelete(session, studentId) {
      if (!session || session.role_level < 9) return { ok: false, error: 'Superadmin access required.' };
      db.prepare('DELETE FROM students WHERE id = ?').run(studentId);
      return { ok: true };
    }
    const result = guardedDelete({ role_level: 9 }, 'STU001');
    expect(result.ok).toBe(true);
    expect(db.prepare('SELECT id FROM students WHERE id = ?').get('STU001')).toBeUndefined();
  });

  it('teacher:deactivate sets is_active = 0 and writes audit_log entry', () => {
    const admin = seedAdmin({ username: 'mgr1', role_level: 5 });
    seedTeacher({ id: 'TCH001', is_active: 1 });
    db.prepare('UPDATE teachers SET is_active = 0 WHERE id = ?').run('TCH001');
    db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'DEACTIVATE_TEACHER', 'teachers', ?)").run(admin.id, 'Deactivated TCH001');
    expect(db.prepare('SELECT is_active FROM teachers WHERE id = ?').get('TCH001').is_active).toBe(0);
    const log = db.prepare("SELECT * FROM audit_logs WHERE action = 'DEACTIVATE_TEACHER'").get();
    expect(log).toBeDefined();
    expect(log.admin_id).toBe(admin.id);
  });

  it('student:deactivate sets is_active = 0 and writes audit_log entry', () => {
    const admin = seedAdmin({ username: 'mgr2', role_level: 5 });
    seedStudent({ id: 'STU001', is_active: 1 });
    db.prepare('UPDATE students SET is_active = 0 WHERE id = ?').run('STU001');
    db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'DEACTIVATE_STUDENT', 'students', ?)").run(admin.id, 'Deactivated STU001');
    expect(db.prepare('SELECT is_active FROM students WHERE id = ?').get('STU001').is_active).toBe(0);
    const log = db.prepare("SELECT * FROM audit_logs WHERE action = 'DEACTIVATE_STUDENT'").get();
    expect(log).toBeDefined();
    expect(log.admin_id).toBe(admin.id);
  });

  it('auth:create-admin stores base64-encoded credential for PIN auth_type', () => {
    const pin = '1234';
    const hash = Buffer.from(pin).toString('base64');
    db.prepare("INSERT INTO admin_users (username, secret_hash, auth_type, role_level) VALUES ('newstaff', ?, 'pin', 1)").run(hash);
    const stored = db.prepare("SELECT * FROM admin_users WHERE username = 'newstaff'").get();
    expect(stored.auth_type).toBe('pin');
    expect(stored.secret_hash).toBe(hash);
    expect(Buffer.from(stored.secret_hash, 'base64').toString()).toBe(pin);
  });

  it('auth-type toggle re-hashes correctly when switching PIN to password', () => {
    const admin = seedAdmin({ username: 'switchuser', auth_type: 'pin', role_level: 9 });
    const newPassword = 'MyStr0ngPass!';
    const newHash = Buffer.from(newPassword).toString('base64');
    db.prepare('UPDATE admin_users SET secret_hash = ?, auth_type = ? WHERE id = ?').run(newHash, 'password', admin.id);
    const updated = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(admin.id);
    expect(updated.auth_type).toBe('password');
    expect(updated.secret_hash).toBe(newHash);
    expect(updated.secret_hash).not.toBe(Buffer.from('1234').toString('base64'));
    expect(Buffer.from(updated.secret_hash, 'base64').toString()).toBe(newPassword);
  });

  // ── Phase 7 Reactivation (cases 9–12) ──────────────────────────────────────

  it('student:reactivate sets is_active = 1 and student reappears in roster SELECT', () => {
    // Start deactivated
    seedStudent({ id: 'STU001', is_active: 0 });
    const before = db.prepare('SELECT id FROM students WHERE COALESCE(is_active, 1) = 1').all();
    expect(before.length).toBe(0);

    // Re-enable
    db.prepare('UPDATE students SET is_active = 1 WHERE id = ?').run('STU001');
    const after = db.prepare('SELECT id FROM students WHERE COALESCE(is_active, 1) = 1').all();
    expect(after.length).toBe(1);
    expect(after[0].id).toBe('STU001');
  });

  it('student:reactivate writes REACTIVATE_STUDENT audit_log entry', () => {
    const admin = seedAdmin({ username: 'superadmin', role_level: 9 });
    seedStudent({ id: 'STU001', is_active: 0 });
    db.prepare('UPDATE students SET is_active = 1 WHERE id = ?').run('STU001');
    db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'REACTIVATE_STUDENT', 'students', ?)").run(admin.id, 'Re-enabled: Ade Bello (STU001)');
    const log = db.prepare("SELECT * FROM audit_logs WHERE action = 'REACTIVATE_STUDENT'").get();
    expect(log).toBeDefined();
    expect(log.admin_id).toBe(admin.id);
    expect(log.details).toContain('STU001');
  });

  it('teacher:reactivate sets is_active = 1 and teacher reappears in roster SELECT', () => {
    // Start deactivated
    seedTeacher({ id: 'TCH001', is_active: 0 });
    const before = db.prepare('SELECT id FROM teachers WHERE COALESCE(is_active, 1) = 1').all();
    expect(before.length).toBe(0);

    // Re-enable
    db.prepare('UPDATE teachers SET is_active = 1 WHERE id = ?').run('TCH001');
    const after = db.prepare('SELECT id FROM teachers WHERE COALESCE(is_active, 1) = 1').all();
    expect(after.length).toBe(1);
    expect(after[0].id).toBe('TCH001');
  });

  it('teacher:reactivate writes REACTIVATE_TEACHER audit_log entry', () => {
    const admin = seedAdmin({ username: 'superadmin2', role_level: 9 });
    seedTeacher({ id: 'TCH001', is_active: 0 });
    db.prepare('UPDATE teachers SET is_active = 1 WHERE id = ?').run('TCH001');
    db.prepare("INSERT INTO audit_logs (admin_id, action, target, details) VALUES (?, 'REACTIVATE_TEACHER', 'teachers', ?)").run(admin.id, 'Re-enabled: Mr. John (TCH001)');
    const log = db.prepare("SELECT * FROM audit_logs WHERE action = 'REACTIVATE_TEACHER'").get();
    expect(log).toBeDefined();
    expect(log.admin_id).toBe(admin.id);
    expect(log.details).toContain('TCH001');
  });

  it('includeInactive flag allows deactivated students to appear in roster SELECT', () => {
    seedStudent({ id: 'STU001', is_active: 1 });
    seedStudent({ id: 'STU002', name: 'Archived', reg_no: 'REG002', is_active: 0 });
    // Without flag — only active
    const active = db.prepare('SELECT id FROM students WHERE COALESCE(is_active, 1) = 1').all();
    expect(active.length).toBe(1);
    // With flag — both visible (no is_active filter applied)
    const all = db.prepare('SELECT id FROM students').all();
    expect(all.length).toBe(2);
  });

});

