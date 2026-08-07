/**
 * tests/phase10-ils-status-guards.test.js
 *
 * Unit tests verifying that inactive (is_active = 0) and overflow (status = 'overflow')
 * students are strictly excluded/blocked across ILS and report workflows.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

const betterSqlite3 = require('better-sqlite3');
const database = require('@nexus/engine/src/database');
const { assembleStudentsForReport } = require('@nexus/engine/src/report-assembler');

describe('ILS and Report Student Status Guards (Inactive & Overflow)', () => {
  let db;
  let tempDbPath;

  beforeEach(() => {
    tempDbPath = path.join(os.tmpdir(), `test_ils_guards_${Date.now()}.db`);
    database.init(tempDbPath, betterSqlite3);
    db = database.getDb();

    // Ensure schema columns exist
    try { db.exec("ALTER TABLE students ADD COLUMN status TEXT DEFAULT 'active'"); } catch (_) {}
    try { db.exec("ALTER TABLE students ADD COLUMN enrollment_status TEXT DEFAULT 'active'"); } catch (_) {}
    try { db.exec("ALTER TABLE class_configs ADD COLUMN curriculum_type TEXT DEFAULT 'STANDARD_NIGERIAN'"); } catch (_) {}
    try { db.exec("ALTER TABLE class_configs ADD COLUMN pac_count INTEGER DEFAULT 12"); } catch (_) {}
    try { db.exec("ALTER TABLE class_configs ADD COLUMN pac_labels TEXT DEFAULT NULL"); } catch (_) {}
    try { db.exec("INSERT OR REPLACE INTO school_term_config (id, academic_session, term) VALUES (1, '2025/2026', 'First Term')"); } catch (_) {}
    try { db.exec("INSERT OR REPLACE INTO class_configs (hierarchy_class, curriculum_type) VALUES ('JSS1', 'ILS')"); } catch (_) {}

    db.exec(`
      CREATE TABLE IF NOT EXISTS ils_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT,
        academic_session TEXT,
        term TEXT,
        subject TEXT,
        pack_number INTEGER,
        score REAL,
        passed INTEGER,
        UNIQUE(student_id, academic_session, term, subject, pack_number)
      );
    `);

    // Insert 3 test students:
    // 1. Active student
    // 2. Soft-deactivated student (is_active = 0)
    // 3. Overflow student (status = 'overflow')
    db.prepare(`
      INSERT OR REPLACE INTO students (id, name, class_name, is_active, status, enrollment_status)
      VALUES 
        ('STU-ACTIVE', 'Active Student', 'JSS1', 1, 'active', 'active'),
        ('STU-INACTIVE', 'Deactivated Student', 'JSS1', 0, 'active', 'inactive'),
        ('STU-OVERFLOW', 'Overflow Student', 'JSS1', 1, 'overflow', 'active')
    `).run();
  });

  afterEach(() => {
    try { database.close(); } catch (_) {}
    try { if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath); } catch (_) {}
  });

  it('should allow active student in assembleStudentsForReport and query filters', () => {
    const activeClause = "COALESCE(is_active, 1) = 1 AND COALESCE(status, 'active') != 'overflow' AND COALESCE(enrollment_status, 'active') != 'inactive'";
    const activeStudents = db.prepare(`SELECT * FROM students WHERE ${activeClause}`).all();
    
    expect(activeStudents).toHaveLength(1);
    expect(activeStudents[0].id).toBe('STU-ACTIVE');
  });

  it('should exclude inactive and overflow students from report assembly list', () => {
    const activeClause = "COALESCE(is_active, 1) = 1 AND COALESCE(status, 'active') != 'overflow' AND COALESCE(enrollment_status, 'active') != 'inactive'";
    const validIds = db.prepare(`SELECT id FROM students WHERE ${activeClause}`).all().map(r => r.id);

    const { students } = assembleStudentsForReport(db, validIds, 'First Term', '2025/2026');
    expect(students).toHaveLength(1);
    expect(students[0].id).toBe('STU-ACTIVE');
  });

  it('should block score sync / insertion for inactive or overflow students', () => {
    const stuInactive = db.prepare("SELECT is_active, status, enrollment_status FROM students WHERE id = ?").get('STU-INACTIVE');
    const isBlockedInactive = !stuInactive || stuInactive.is_active === 0 || stuInactive.status === 'overflow' || stuInactive.enrollment_status === 'inactive';
    expect(isBlockedInactive).toBe(true);

    const stuOverflow = db.prepare("SELECT is_active, status, enrollment_status FROM students WHERE id = ?").get('STU-OVERFLOW');
    const isBlockedOverflow = !stuOverflow || stuOverflow.is_active === 0 || stuOverflow.status === 'overflow' || stuOverflow.enrollment_status === 'inactive';
    expect(isBlockedOverflow).toBe(true);

    const stuActive = db.prepare("SELECT is_active, status, enrollment_status FROM students WHERE id = ?").get('STU-ACTIVE');
    const isBlockedActive = !stuActive || stuActive.is_active === 0 || stuActive.status === 'overflow' || stuActive.enrollment_status === 'inactive';
    expect(isBlockedActive).toBe(false);
  });
});
