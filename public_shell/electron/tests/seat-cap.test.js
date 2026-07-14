import { describe, it, expect, beforeEach } from 'vitest';

class MockDatabase {
  constructor() {
    this.students = new Map();
    this.settings = new Map();
    this.auditLogs = [];
  }

  prepare(sql) {
    const db = this;
    const normSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    return {
      get: (...args) => {
        if (normSql.includes('select count(id) as c from students')) {
          return { c: db.students.size };
        }
        if (normSql.includes('select 1 from students where id =')) {
          const id = args[0];
          return db.students.has(id) ? { 1: 1 } : null;
        }
        if (normSql.includes('select value from system_settings where key =')) {
          const key = args[0];
          return db.settings.has(key) ? { value: db.settings.get(key) } : null;
        }
        if (normSql.includes('sqlite_master') && normSql.includes("name='students'")) {
          return { name: 'students' };
        }
        return null;
      },
      run: (...args) => {
        if (normSql.includes('insert into students') || normSql.includes('insert or replace into students')) {
          // Check if arguments are passed as an array or object
          let id, name, class_name;
          if (typeof args[0] === 'object' && args[0] !== null) {
            id = args[0].id;
            name = args[0].name;
            class_name = args[0].class_name;
          } else {
            id = args[0];
            name = args[1];
            class_name = args[2];
          }
          db.students.set(id, { id, name, class_name });
          return { changes: 1 };
        }
        if (normSql.includes('insert or replace into system_settings')) {
          let key, value;
          if (typeof args[0] === 'object' && args[0] !== null) {
            key = args[0].key;
            value = args[0].value;
          } else {
            key = args[0];
            value = args[1];
          }
          db.settings.set(key, value);
          return { changes: 1 };
        }
        if (normSql.includes('delete from system_settings')) {
          const key = args[0];
          db.settings.delete(key);
          return { changes: 1 };
        }
        if (normSql.includes('insert into audit_logs')) {
          db.auditLogs.push(args);
          return { changes: 1 };
        }
        return { changes: 0 };
      }
    };
  }

  exec() {
    // no-op
  }
}

describe('Seat Cap and Quota Gating Engine', () => {
  let db;

  beforeEach(() => {
    db = new MockDatabase();
  });

  // Mock Gated Features list
  const GATED_FEATURES = [
    'generate-reports',
    'results:dispatch',
    'results:publish',
    'fees:record-payment',
    'fees:upsert',
    'cbt:deploy-exam',
    'cbt:create-batch',
    'cbt:dispatch-pulse-notifications'
  ];

  // Logic under test: assertQuotaCompliant
  function assertQuotaCompliant(channel, licenseStatus) {
    if (GATED_FEATURES.includes(channel)) {
      if (licenseStatus?.quotaEnforced) {
        return {
          ok: false,
          error: 'QUOTA_ENFORCEMENT_ACTIVE',
          enrolled: licenseStatus.enrolledCount || 0,
          cap: licenseStatus.student_count || 0,
          daysSinceGrace: licenseStatus.daysSinceGrace || 0
        };
      }
    }
    return null;
  }

  // Logic under test: add-student-form check
  function addStudentCheck({ id, name, class_name }, licenseStatus) {
    const cap = licenseStatus?.student_count;
    const hasCap = typeof cap === 'number' && Number.isFinite(cap) && cap < 999999;
    
    if (hasCap) {
      const isExisting = db.prepare('SELECT 1 FROM students WHERE id = ? LIMIT 1').get(id);
      if (!isExisting) {
        const currentCount = db.prepare('SELECT COUNT(id) AS c FROM students').get().c;
        if (currentCount >= cap) {
          return { ok: false, error: 'STUDENT_CAP_REACHED', cap, currentCount };
        }
      }
    }
    
    db.prepare('INSERT OR REPLACE INTO students (id, name, class_name) VALUES (?, ?, ?)').run(id, name, class_name);
    return { ok: true };
  }

  // Logic under test: students:validate-csv
  function validateCSV(rows, licenseStatus) {
    let newStudents = 0;
    let existingStudents = 0;

    for (const row of rows) {
      const studentId = row.id;
      const exists = db.prepare('SELECT 1 FROM students WHERE id = ? LIMIT 1').get(studentId);
      if (exists) existingStudents++;
      else newStudents++;
    }

    const totalEnrolled = db.prepare('SELECT COUNT(id) AS c FROM students').get().c;
    const cap = licenseStatus?.student_count;
    const hasCap = typeof cap === 'number' && Number.isFinite(cap) && cap < 999999;
    const available = hasCap ? Math.max(0, cap - totalEnrolled) : Infinity;
    const willExceed = hasCap && newStudents > available;
    const skippedCount = hasCap ? Math.max(0, newStudents - available) : 0;

    return {
      ok: true,
      total: rows.length,
      newStudents,
      existingStudents,
      totalEnrolled,
      cap: hasCap ? cap : null,
      available: hasCap ? available : null,
      willExceed,
      skippedCount,
    };
  }

  it('assertQuotaCompliant blocks gated feature when quotaEnforced is true', () => {
    const licenseStatus = {
      quotaEnforced: true,
      enrolledCount: 150,
      student_count: 81,
      daysSinceGrace: 10
    };

    const result = assertQuotaCompliant('generate-reports', licenseStatus);
    expect(result).not.toBeNull();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('QUOTA_ENFORCEMENT_ACTIVE');
    expect(result.enrolled).toBe(150);
  });

  it('assertQuotaCompliant passes non-gated feature even when quotaEnforced is true', () => {
    const licenseStatus = {
      quotaEnforced: true,
      enrolledCount: 150,
      student_count: 81,
      daysSinceGrace: 10
    };

    const result = assertQuotaCompliant('get-all-students', licenseStatus);
    expect(result).toBeNull();
  });

  it('add-student-form logic blocks when count >= cap', () => {
    const licenseStatus = {
      student_count: 2
    };

    db.prepare('INSERT INTO students (id, name, class_name) VALUES (?, ?, ?)').run('s1', 'Student One', 'Class 1');
    db.prepare('INSERT INTO students (id, name, class_name) VALUES (?, ?, ?)').run('s2', 'Student Two', 'Class 1');

    const result = addStudentCheck({ id: 's3', name: 'Student Three', class_name: 'Class 1' }, licenseStatus);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('STUDENT_CAP_REACHED');
    expect(result.cap).toBe(2);
  });

  it('add-student-form logic allows update of existing student even when at cap', () => {
    const licenseStatus = {
      student_count: 2
    };

    db.prepare('INSERT INTO students (id, name, class_name) VALUES (?, ?, ?)').run('s1', 'Student One', 'Class 1');
    db.prepare('INSERT INTO students (id, name, class_name) VALUES (?, ?, ?)').run('s2', 'Student Two', 'Class 1');

    const result = addStudentCheck({ id: 's1', name: 'Student One Updated', class_name: 'Class 1' }, licenseStatus);
    expect(result.ok).toBe(true);
    
    const updated = db.prepare('SELECT name FROM students WHERE id = ?').get('s1');
    // In our MockDatabase, let's verify if map updated:
    const s1 = db.students.get('s1');
    expect(s1.name).toBe('Student One Updated');
  });

  it('students:validate-csv logic returns correct willExceed and skippedCount', () => {
    const licenseStatus = {
      student_count: 5
    };

    db.prepare('INSERT INTO students (id, name, class_name) VALUES (?, ?, ?)').run('s1', 'A', '1');
    db.prepare('INSERT INTO students (id, name, class_name) VALUES (?, ?, ?)').run('s2', 'B', '1');
    db.prepare('INSERT INTO students (id, name, class_name) VALUES (?, ?, ?)').run('s3', 'C', '1');

    const csvRows = [
      { id: 's4' },
      { id: 's5' },
      { id: 's6' },
      { id: 's7' }
    ];

    const result = validateCSV(csvRows, licenseStatus);
    expect(result.ok).toBe(true);
    expect(result.newStudents).toBe(4);
    expect(result.available).toBe(2);
    expect(result.willExceed).toBe(true);
    expect(result.skippedCount).toBe(2);
  });
});
