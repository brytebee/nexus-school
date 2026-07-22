import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const { database, server } = require('@nexus/engine');

describe('CSV Relational Sanitization & Dry-Run Tests', () => {
  let tmpDir;
  let db;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-csv-test-'));
    db = database.init(':memory:');

    // Seed term config
    db.prepare(`
      INSERT OR REPLACE INTO school_term_config (id, academic_session, term, grading_scale)
      VALUES (1, '2025/2026', 'First Term', '{"components":[{"key":"ca1","label":"CA 1"},{"key":"exam","label":"Exam"}]}')
    `).run();

    // Seed valid class config and arm
    db.prepare(`INSERT OR IGNORE INTO class_configs (hierarchy_class, max_subjects) VALUES ('JSS 1', 10)`).run();
    db.prepare(`INSERT OR IGNORE INTO class_arms (hierarchy_class, arm) VALUES ('JSS 1', 'Gold')`).run();

    // Seed valid student
    db.prepare(`
      INSERT OR IGNORE INTO students (id, name, class_name, class_arm, enrollment_status)
      VALUES ('STU-001', 'John Doe', 'JSS 1', 'Gold', 'active')
    `).run();
  });

  afterEach(() => {
    server.clearData();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ── Teacher / Student class validation ─────────────────────────────────────

  it('dry-run: rejects teacher allocated to unregistered arm', () => new Promise((resolve) => {
    const csvPath = path.join(tmpDir, 'teachers.csv');
    fs.writeFileSync(csvPath, [
      'Teacher_ID,Teacher_Name,Teacher_Phone,Class,Subjects',
      'TCH-001,Mr Smith,08011111111,JSS 99 Gold,Mathematics',
    ].join('\n') + '\n');

    server.handleCSVUpload(csvPath, (count, err, payload) => {
      expect(payload.dry_run).toBe(true);
      expect(payload.blocking.length).toBeGreaterThan(0);
      expect(payload.blocking[0].field).toBe('Class');
      expect(payload.blocking[0].reason).toContain('JSS 99 Gold');
      resolve(null);
    }, undefined, true);
  }));

  it('dry-run: rejects student CSV with invalid arm "JSS 1 A" when JSS 1 has arm Gold', () => new Promise((resolve) => {
    const csvPath = path.join(tmpDir, 'students_invalid_arm.csv');
    fs.writeFileSync(csvPath, [
      'Student_ID,First_Name,Last_Name,Class',
      'STU-999,Jane,Doe,JSS 1 A',
    ].join('\n') + '\n');

    server.handleCSVUpload(csvPath, (count, err, payload) => {
      expect(payload.dry_run).toBe(true);
      expect(payload.blocking.length).toBe(1);
      expect(payload.blocking[0].field).toBe('Class');
      expect(payload.blocking[0].reason).toContain('Arm "A" is not registered');
      resolve(null);
    }, undefined, true);
  }));

  it('dry-run: rejects student CSV with bare "JSS 1" (missing arm) when JSS 1 has arms', () => new Promise((resolve) => {
    const csvPath = path.join(tmpDir, 'students_missing_arm.csv');
    fs.writeFileSync(csvPath, [
      'Student_ID,First_Name,Last_Name,Class',
      'STU-998,Jane,Doe,JSS 1',
    ].join('\n') + '\n');

    server.handleCSVUpload(csvPath, (count, err, payload) => {
      expect(payload.dry_run).toBe(true);
      expect(payload.blocking.length).toBe(1);
      expect(payload.blocking[0].field).toBe('Class');
      expect(payload.blocking[0].reason).toContain('requires a designated arm');
      resolve(null);
    }, undefined, true);
  }));

  it('dry-run: accepts student CSV with valid arm "JSS 1 Gold"', () => new Promise((resolve) => {
    const csvPath = path.join(tmpDir, 'students_valid_arm.csv');
    fs.writeFileSync(csvPath, [
      'Student_ID,First_Name,Last_Name,Class',
      'STU-997,Jane,Doe,JSS 1 Gold',
    ].join('\n') + '\n');

    server.handleCSVUpload(csvPath, (count, err, payload) => {
      expect(payload.dry_run).toBe(true);
      expect(payload.blocking.length).toBe(0);
      expect(payload.cleanCount).toBe(1);
      resolve(null);
    }, undefined, true);
  }));

  it('confirmed import: aborts when teacher CSV references invalid class', () => new Promise((resolve) => {
    const csvPath = path.join(tmpDir, 'teachers_invalid.csv');
    fs.writeFileSync(csvPath, [
      'Teacher_ID,Teacher_Name,Teacher_Phone,Class,Subjects',
      'TCH-002,Mrs Adams,08022222222,SSS 88,English',
    ].join('\n') + '\n');

    server.handleCSVUpload(csvPath, (count, err, payload) => {
      expect(count).toBe(0);
      expect(err).toContain('VAL_ERR');
      expect(payload.blocking.length).toBeGreaterThan(0);
      // Verify nothing was written
      const teachers = db.prepare("SELECT id FROM teachers WHERE id = 'TCH-002'").get();
      expect(teachers).toBeUndefined();
      resolve(null);
    }, undefined, false);
  }));

  // ── Fee structure class validation ─────────────────────────────────────────

  it('dry-run: rejects fee item mapped to unregistered class', () => new Promise((resolve) => {
    const csvPath = path.join(tmpDir, 'fee_struct.csv');
    fs.writeFileSync(csvPath, [
      'Class_Name,Item_Name,Amount,Term',
      'Ghost Class,Tuition Fee,50000,First Term',
    ].join('\n') + '\n');

    server.handleFeeStructureCSVUpload(csvPath, (count, err, payload) => {
      expect(payload.dry_run).toBe(true);
      expect(payload.blocking.length).toBe(1);
      expect(payload.blocking[0].reason).toContain('Ghost Class');
      resolve(null);
    }, true);
  }));

  it('confirmed import: blocks fee structure with unknown class', () => new Promise((resolve) => {
    const csvPath = path.join(tmpDir, 'fee_struct_bad.csv');
    fs.writeFileSync(csvPath, [
      'Class_Name,Item_Name,Amount,Term',
      'Ghost Class,Tuition Fee,50000,First Term',
    ].join('\n') + '\n');

    server.handleFeeStructureCSVUpload(csvPath, (count, err) => {
      expect(count).toBe(0);
      expect(err).toContain('VAL_ERR');
      const fee = db.prepare("SELECT * FROM fee_structures WHERE class_name = 'Ghost Class'").get();
      expect(fee).toBeUndefined();
      resolve(null);
    }, false);
  }));

  // ── Grades: student ID validation ─────────────────────────────────────────

  it('dry-run: rejects grade row with unknown student ID', () => new Promise((resolve) => {
    const csvPath = path.join(tmpDir, 'grades_unknown.csv');
    fs.writeFileSync(csvPath, [
      'Student_ID,Subject,Assessment,Score',
      'GHOST-999,Mathematics,FULL,85',
    ].join('\n') + '\n');

    server.handleGradesCSVUpload(csvPath, (count, err, payload) => {
      expect(payload.dry_run).toBe(true);
      expect(payload.blocking.length).toBe(1);
      expect(payload.blocking[0].field).toBe('Student_ID');
      expect(payload.blocking[0].reason).toContain('GHOST-999');
      resolve(null);
    }, true);
  }));

  it('dry-run: warns on session/term mismatch but does not block', () => new Promise((resolve) => {
    const csvPath = path.join(tmpDir, 'grades_mismatch.csv');
    fs.writeFileSync(csvPath, [
      'Student_ID,Subject,Assessment,Score,Session,Term',
      'STU-001,Mathematics,FULL,90,2024/2025,Third Term',
    ].join('\n') + '\n');

    server.handleGradesCSVUpload(csvPath, (count, err, payload) => {
      expect(payload.dry_run).toBe(true);
      expect(payload.blocking.length).toBe(0);       // no errors — student is valid
      expect(payload.normalizable.length).toBe(1);   // one session/term warning
      expect(payload.activeSession).toBe('2025/2026');
      expect(payload.activeTerm).toBe('First Term');
      resolve(null);
    }, true);
  }));

  it('confirmed import: stamps active session/term, ignores CSV values', () => new Promise((resolve) => {
    const csvPath = path.join(tmpDir, 'grades_valid.csv');
    fs.writeFileSync(csvPath, [
      'Student_ID,Subject,Assessment,Score,Session,Term',
      'STU-001,Mathematics,FULL,95,2024/2025,Third Term', // divergent — should be overridden
    ].join('\n') + '\n');

    server.handleGradesCSVUpload(csvPath, (count, err) => {
      expect(err).toBeNull();
      expect(count).toBe(1);
      const record = db.prepare("SELECT * FROM student_records WHERE student_id = 'STU-001'").get();
      expect(record).toBeDefined();
      expect(record.score).toBe(95);
      expect(record.academic_session).toBe('2025/2026'); // active, not CSV value
      expect(record.term).toBe('First Term');            // active, not CSV value
      resolve(null);
    }, false);
  }));

  // ── Attendance: student ID validation ──────────────────────────────────────

  it('dry-run: rejects attendance row with unknown student ID', () => new Promise((resolve) => {
    const csvPath = path.join(tmpDir, 'att_unknown.csv');
    fs.writeFileSync(csvPath, [
      'Student_ID,Total_Days,Days_Attended',
      'BAD-ID-123,60,55',
    ].join('\n') + '\n');

    server.handleAttendanceCSVUpload(csvPath, (count, err, payload) => {
      expect(payload.dry_run).toBe(true);
      expect(payload.blocking.length).toBe(1);
      expect(payload.blocking[0].field).toBe('Student_ID');
      expect(payload.blocking[0].reason).toContain('BAD-ID-123');
      resolve(null);
    }, true);
  }));

  it('confirmed import: attendance stamps active session/term correctly', () => new Promise((resolve) => {
    const csvPath = path.join(tmpDir, 'att_valid.csv');
    fs.writeFileSync(csvPath, [
      'Student_ID,Total_Days,Days_Attended,Session,Term',
      'STU-001,60,55,2024/2025,Third Term', // divergent session/term — must be overridden
    ].join('\n') + '\n');

    server.handleAttendanceCSVUpload(csvPath, (count, err) => {
      expect(err).toBeNull();
      expect(count).toBe(1);
      const rec = db.prepare("SELECT * FROM student_attendance WHERE student_id = 'STU-001'").get();
      expect(rec).toBeDefined();
      expect(rec.academic_session).toBe('2025/2026');
      expect(rec.term).toBe('First Term');
      expect(rec.total_days).toBe(60);
      resolve(null);
    }, false);
  }));

  // ── No active term configured ──────────────────────────────────────────────

  it('dry-run: grades import errors if no active term configured', () => new Promise((resolve) => {
    db.prepare('DELETE FROM school_term_config WHERE id = 1').run();

    const csvPath = path.join(tmpDir, 'grades_no_term.csv');
    fs.writeFileSync(csvPath, [
      'Student_ID,Subject,Score',
      'STU-001,Mathematics,80',
    ].join('\n') + '\n');

    server.handleGradesCSVUpload(csvPath, (count, err) => {
      expect(count).toBe(0);
      expect(err).toBe('SETUP_INCOMPLETE');
      resolve(null);
    }, true);
  }));
});
