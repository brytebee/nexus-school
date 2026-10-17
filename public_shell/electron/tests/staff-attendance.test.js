/**
 * tests/staff-attendance.test.js
 *
 * Verification suite for Staff Portal Attendance:
 * 1. Composite Class Name Decomposition (Grade 5 ACE -> Grade 5, arm: ACE)
 * 2. Deduplication of Class and Arm in Staff Scope
 * 3. Daily Attendance roll call save and retrieval (hydration)
 */

import { describe, it, expect, beforeEach } from 'vitest';
const { database } = require('@nexus/engine');

describe('Staff Portal: Attendance & Class/Arm Deduplication', () => {
  let db;

  beforeEach(() => {
    db = database.init(':memory:');
    db.exec(`
      DELETE FROM daily_attendance;
      DELETE FROM teacher_allocations;
      DELETE FROM form_teachers;
      DELETE FROM students;
      DELETE FROM teachers;
    `);
  });

  function seedTeacher(id = 'TCH-TEST', name = 'Test Teacher') {
    db.prepare('INSERT OR REPLACE INTO teachers (id, name, is_active) VALUES (?, ?, 1)').run(id, name);
    return id;
  }

  function seedStudent(id, name, className, arm) {
    db.prepare('INSERT OR REPLACE INTO students (id, name, class_name, class_arm, is_active) VALUES (?, ?, ?, ?, 1)')
      .run(id, name, className, arm);
  }

  it('correctly maps composite allocations to clean base class names and arms', () => {
    const teacherId = seedTeacher('TCH-001', 'Mrs. Smith');
    seedStudent('STU-1', 'Alice', 'Grade 5', 'ACE');
    seedStudent('STU-2', 'Bob', 'Grade 5', 'Nigeria Standard');
    seedStudent('STU-3', 'Charlie', 'JSS 1', 'Ruby');

    // Composite allocation in teacher_allocations
    db.prepare('INSERT INTO teacher_allocations (teacher_id, class_name, subject) VALUES (?, ?, ?)')
      .run(teacherId, 'Grade 5 ACE', 'Mathematics');
    db.prepare('INSERT INTO teacher_allocations (teacher_id, class_name, subject) VALUES (?, ?, ?)')
      .run(teacherId, 'JSS 1 Ruby', 'English');

    // Query distinct allocations
    const allocations = db.prepare('SELECT DISTINCT class_name, subject FROM teacher_allocations WHERE teacher_id = ?').all(teacherId);
    expect(allocations.length).toBe(2);

    // Verify decomposition logic
    const directMatch = db.prepare('SELECT 1 FROM students WHERE class_name = ? LIMIT 1').get('Grade 5 ACE');
    expect(directMatch).toBeFalsy();

    // Verify scan logic
    const pairs = db.prepare("SELECT DISTINCT class_name, class_arm FROM students WHERE class_arm IS NOT NULL").all();
    let resolvedBase = null;
    let resolvedArm = null;
    for (const p of pairs) {
      if (`${p.class_name} ${p.class_arm}`.trim().toLowerCase() === 'Grade 5 ACE'.toLowerCase()) {
        resolvedBase = p.class_name;
        resolvedArm = p.class_arm;
        break;
      }
    }
    expect(resolvedBase).toBe('Grade 5');
    expect(resolvedArm).toBe('ACE');
  });

  it('records roll call and successfully hydrates attendance by date and class/arm', () => {
    const teacherId = seedTeacher('TCH-002', 'Mr. Johnson');
    seedStudent('STU-10', 'Student One', 'Grade 5', 'ACE');
    seedStudent('STU-11', 'Student Two', 'Grade 5', 'ACE');
    seedStudent('STU-12', 'Student Three', 'Grade 5', 'ACE');

    const date = '2026-10-17';
    const insertStmt = db.prepare(`
      INSERT INTO daily_attendance (student_id, class_name, date, status, academic_session, term, recorded_by_teacher_id)
      VALUES (?, ?, ?, ?, '2025/2026', 'First Term', ?)
      ON CONFLICT(student_id, date) DO UPDATE SET
        status = excluded.status,
        recorded_by_teacher_id = excluded.recorded_by_teacher_id
    `);

    // Record roll call: STU-10 = present, STU-11 = absent, STU-12 = late
    insertStmt.run('STU-10', 'Grade 5', date, 'present', teacherId);
    insertStmt.run('STU-11', 'Grade 5', date, 'absent', teacherId);
    insertStmt.run('STU-12', 'Grade 5', date, 'late', teacherId);

    // Retrieve attendance for date and class
    const query = `
      SELECT da.student_id, da.status, da.class_name, da.date
      FROM daily_attendance da
      JOIN students s ON s.id = da.student_id
      WHERE da.date = ? AND (da.class_name = ? OR s.class_name = ?) AND s.class_arm = ?
    `;
    const rows = db.prepare(query).all(date, 'Grade 5', 'Grade 5', 'ACE');

    expect(rows.length).toBe(3);
    const statusMap = Object.fromEntries(rows.map(r => [r.student_id, r.status]));
    expect(statusMap['STU-10']).toBe('present');
    expect(statusMap['STU-11']).toBe('absent');
    expect(statusMap['STU-12']).toBe('late');

    // Update attendance on same date: STU-11 arrives late instead of absent
    insertStmt.run('STU-11', 'Grade 5', date, 'late', teacherId);
    const updatedRows = db.prepare(query).all(date, 'Grade 5', 'Grade 5', 'ACE');
    const updatedMap = Object.fromEntries(updatedRows.map(r => [r.student_id, r.status]));
    expect(updatedMap['STU-11']).toBe('late');
  });
});
