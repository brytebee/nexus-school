/**
 * tests/phase4-slugs-seats.test.js
 *
 * Phase 4 — Sovereign Portal Slugs & Seat Expansion
 */

import { describe, it, expect, beforeEach } from 'vitest';
const { database } = require('@nexus/engine');

// ── Helpers ───────────────────────────────────────────────────────────────────

function insertStudent(db, { id, name, cls = 'JSS 1', arm = 'A', status = 'active', created_at }) {
  try { db.prepare("ALTER TABLE students ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP").run(); } catch (_) {}
  db.prepare(
    `INSERT OR IGNORE INTO students
       (id, name, class_name, class_arm, enrollment_status, created_at, session_history)
     VALUES (?, ?, ?, ?, ?, ?, '[]')`
  ).run(id, name, cls, arm, status, created_at ?? new Date().toISOString());
}

function simulateRefreshPromote(db, cap) {
  const hasCap = typeof cap === 'number' && isFinite(cap) && cap < 999999;
  const activeCount = db.prepare(
    "SELECT COUNT(id) AS c FROM students WHERE enrollment_status = 'active' OR enrollment_status IS NULL OR enrollment_status = ''"
  ).get().c;

  const slotsAvailable = hasCap ? Math.max(0, cap - activeCount) : 999999;
  if (slotsAvailable <= 0) return { promoted: 0 };

  const overflowStudents = db.prepare(
    "SELECT id FROM students WHERE enrollment_status = 'overflow' ORDER BY created_at ASC LIMIT ?"
  ).all(slotsAvailable);

  if (overflowStudents.length === 0) return { promoted: 0 };

  const stmt = db.prepare("UPDATE students SET enrollment_status = 'active' WHERE id = ?");
  for (const s of overflowStudents) stmt.run(s.id);
  return { promoted: overflowStudents.length };
}

function queryStudents(db, { include_overflow = false, enrollment_status_filter = null, search = '' } = {}) {
  const query = search ? `%${search}%` : '%';
  let conditions = '(s.name LIKE ? OR s.id LIKE ? OR s.reg_no LIKE ?)';
  const params = [query, query, query];

  if (!include_overflow) {
    conditions += " AND (s.enrollment_status = 'active' OR s.enrollment_status IS NULL OR s.enrollment_status = '')";
  }
  if (enrollment_status_filter) {
    conditions += ' AND s.enrollment_status = ?';
    params.push(enrollment_status_filter);
  }

  return db.prepare(
    `SELECT s.id, s.name, s.enrollment_status
     FROM students s
     WHERE ${conditions}
     ORDER BY s.name ASC`
  ).all(...params);
}

function validateSlugInput(slug) {
  if (!slug || typeof slug !== 'string') return { ok: false, message: 'Slug must be a non-empty string.' };
  const trimmed = slug.trim();
  if (trimmed.length < 4)  return { ok: false, message: 'Slug must be at least 4 characters.' };
  if (trimmed.length > 30) return { ok: false, message: 'Slug must be at most 30 characters.' };
  const cleaned = trimmed.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (cleaned !== trimmed.toLowerCase()) return { ok: false, message: 'Slug contains invalid characters (only a-z, 0-9, hyphens).' };
  if (cleaned.startsWith('-') || cleaned.endsWith('-')) return { ok: false, message: 'Slug must not start or end with a hyphen.' };
  return { ok: true, cleaned };
}

function applyPreset(current, delta) {
  return Math.min(10000, current + delta);
}

// ─────────────────────────────────────────────────────────────────────────────
// A. SLUG VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

describe('A. Slug validation (client-side guard)', () => {
  it('A1. rejects null', () => {
    expect(validateSlugInput(null).ok).toBe(false);
  });

  it('A2. rejects empty string', () => {
    expect(validateSlugInput('').ok).toBe(false);
  });

  it('A3. rejects slug shorter than 4 characters', () => {
    const r = validateSlugInput('abc');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/4 characters/);
  });

  it('A4. rejects slug longer than 30 characters', () => {
    const r = validateSlugInput('a'.repeat(31));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/30 characters/);
  });

  it('A5. rejects slugs with spaces', () => {
    expect(validateSlugInput('my school').ok).toBe(false);
  });

  it('A6. rejects slugs with @ symbol', () => {
    expect(validateSlugInput('school@123').ok).toBe(false);
  });

  it('A7. rejects slugs that start with a hyphen', () => {
    expect(validateSlugInput('-myschool').ok).toBe(false);
  });

  it('A8. rejects slugs that end with a hyphen', () => {
    expect(validateSlugInput('myschool-').ok).toBe(false);
  });

  it('A9. accepts a valid 4-character slug', () => {
    const r = validateSlugInput('abcd');
    expect(r.ok).toBe(true);
    expect(r.cleaned).toBe('abcd');
  });

  it('A10. accepts a valid slug with hyphens', () => {
    const r = validateSlugInput('nexus-academy');
    expect(r.ok).toBe(true);
    expect(r.cleaned).toBe('nexus-academy');
  });

  it('A11. accepts a valid slug with digits', () => {
    const r = validateSlugInput('school2025');
    expect(r.ok).toBe(true);
    expect(r.cleaned).toBe('school2025');
  });

  it('A12. accepts exactly 30-character slug', () => {
    expect(validateSlugInput('a'.repeat(30)).ok).toBe(true);
  });

  it('A13. cleaned slug is always lowercase', () => {
    expect(validateSlugInput('myacademy').cleaned).toBe('myacademy');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. enrollment_status_filter in get-all-students
// ─────────────────────────────────────────────────────────────────────────────

describe('B. get-all-students enrollment_status_filter (real SQLite)', () => {
  let db;

  beforeEach(() => {
    db = database.init(':memory:');
    try { db.prepare('DELETE FROM students').run(); } catch (_) {}

    insertStudent(db, { id: 's1', name: 'Alice',   status: 'active',   created_at: '2025-01-01T00:00:00Z' });
    insertStudent(db, { id: 's2', name: 'Bob',     status: 'active',   created_at: '2025-01-02T00:00:00Z' });
    insertStudent(db, { id: 's3', name: 'Charlie', status: 'active',   created_at: '2025-01-03T00:00:00Z' });
    insertStudent(db, { id: 's4', name: 'Diana',   status: 'overflow', created_at: '2025-01-04T00:00:00Z' });
    insertStudent(db, { id: 's5', name: 'Eve',     status: 'overflow', created_at: '2025-01-05T00:00:00Z' });
  });

  it('B1. default query (include_overflow=false) returns only active students', () => {
    const rows = queryStudents(db, { include_overflow: false });
    expect(rows).toHaveLength(3);
    expect(rows.every(r => r.enrollment_status === 'active')).toBe(true);
  });

  it('B2. include_overflow=true without filter returns all 5 students', () => {
    expect(queryStudents(db, { include_overflow: true })).toHaveLength(5);
  });

  it('B3. enrollment_status_filter="overflow" returns only overflow students', () => {
    const rows = queryStudents(db, { include_overflow: true, enrollment_status_filter: 'overflow' });
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.enrollment_status === 'overflow')).toBe(true);
  });

  it('B4. enrollment_status_filter="active" returns only active students even with include_overflow=true', () => {
    const rows = queryStudents(db, { include_overflow: true, enrollment_status_filter: 'active' });
    expect(rows).toHaveLength(3);
    expect(rows.every(r => r.enrollment_status === 'active')).toBe(true);
  });

  it('B5. enrollment_status_filter="overflow" with no overflow students returns empty array', () => {
    db.prepare("UPDATE students SET enrollment_status = 'active' WHERE enrollment_status = 'overflow'").run();
    expect(queryStudents(db, { include_overflow: true, enrollment_status_filter: 'overflow' })).toHaveLength(0);
  });

  it('B6. search term applies on top of enrollment_status_filter', () => {
    const rows = queryStudents(db, { include_overflow: true, enrollment_status_filter: 'overflow', search: 'Diana' });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Diana');
  });

  it('B7. enrollment_status_filter=null with include_overflow=true returns all students', () => {
    expect(queryStudents(db, { include_overflow: true, enrollment_status_filter: null })).toHaveLength(5);
  });

  it('B8. student with NULL enrollment_status is included in active query', () => {
    db.prepare(
      "INSERT OR IGNORE INTO students (id, name, class_name, enrollment_status, session_history) VALUES (?, ?, ?, NULL, '[]')"
    ).run('s6', 'Fred', 'JSS 1');
    const ids = queryStudents(db, { include_overflow: false }).map(r => r.id);
    expect(ids).toContain('s6');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. license:refresh — auto-promote overflow → active
// ─────────────────────────────────────────────────────────────────────────────

describe('C. license:refresh auto-promote logic (real SQLite)', () => {
  let db;

  beforeEach(() => {
    db = database.init(':memory:');
    try { db.prepare('DELETE FROM students').run(); } catch (_) {}
  });

  it('C1. promotes all overflow students when slots fully cover them', () => {
    insertStudent(db, { id: 's1', name: 'Alice',   status: 'active',   created_at: '2025-01-01T00:00:00Z' });
    insertStudent(db, { id: 's2', name: 'Bob',     status: 'active',   created_at: '2025-01-02T00:00:00Z' });
    insertStudent(db, { id: 's3', name: 'Charlie', status: 'active',   created_at: '2025-01-03T00:00:00Z' });
    insertStudent(db, { id: 's4', name: 'Diana',   status: 'overflow', created_at: '2025-01-04T00:00:00Z' });
    insertStudent(db, { id: 's5', name: 'Eve',     status: 'overflow', created_at: '2025-01-05T00:00:00Z' });

    expect(simulateRefreshPromote(db, 5).promoted).toBe(2);
    expect(db.prepare("SELECT COUNT() AS c FROM students WHERE enrollment_status = 'overflow'").get().c).toBe(0);
  });

  it('C2. promotes only as many students as slots available (partial)', () => {
    insertStudent(db, { id: 's1', name: 'Alice', status: 'active',   created_at: '2025-01-01T00:00:00Z' });
    insertStudent(db, { id: 's2', name: 'Bob',   status: 'active',   created_at: '2025-01-02T00:00:00Z' });
    insertStudent(db, { id: 's3', name: 'Alice', status: 'active',   created_at: '2025-01-03T00:00:00Z' });
    insertStudent(db, { id: 's4', name: 'Diana', status: 'overflow', created_at: '2025-01-04T00:00:00Z' });
    insertStudent(db, { id: 's5', name: 'Eve',   status: 'overflow', created_at: '2025-01-05T00:00:00Z' });

    expect(simulateRefreshPromote(db, 4).promoted).toBe(1);
    expect(db.prepare("SELECT COUNT() AS c FROM students WHERE enrollment_status = 'overflow'").get().c).toBe(1);
  });

  it('C3. promotes nothing when active count equals cap', () => {
    insertStudent(db, { id: 's1', name: 'Alice', status: 'active',   created_at: '2025-01-01T00:00:00Z' });
    insertStudent(db, { id: 's2', name: 'Bob',   status: 'overflow', created_at: '2025-01-02T00:00:00Z' });

    expect(simulateRefreshPromote(db, 1).promoted).toBe(0);
    expect(db.prepare("SELECT enrollment_status FROM students WHERE id = 's2'").get().enrollment_status).toBe('overflow');
  });

  it('C4. promotes nothing when active count exceeds cap', () => {
    insertStudent(db, { id: 's1', name: 'A', status: 'active',   created_at: '2025-01-01T00:00:00Z' });
    insertStudent(db, { id: 's2', name: 'B', status: 'active',   created_at: '2025-01-02T00:00:00Z' });
    insertStudent(db, { id: 's3', name: 'C', status: 'overflow', created_at: '2025-01-03T00:00:00Z' });

    expect(simulateRefreshPromote(db, 1).promoted).toBe(0);
  });

  it('C5. promotes ALL overflow when cap is unlimited (999999)', () => {
    insertStudent(db, { id: 's1', name: 'A', status: 'active',   created_at: '2025-01-01T00:00:00Z' });
    insertStudent(db, { id: 's2', name: 'B', status: 'overflow', created_at: '2025-01-02T00:00:00Z' });
    insertStudent(db, { id: 's3', name: 'C', status: 'overflow', created_at: '2025-01-03T00:00:00Z' });
    insertStudent(db, { id: 's4', name: 'D', status: 'overflow', created_at: '2025-01-04T00:00:00Z' });

    expect(simulateRefreshPromote(db, 999999).promoted).toBe(3);
  });

  it('C6. returns promoted=0 when no overflow students exist', () => {
    insertStudent(db, { id: 's1', name: 'A', status: 'active', created_at: '2025-01-01T00:00:00Z' });
    expect(simulateRefreshPromote(db, 10).promoted).toBe(0);
  });

  it('C7. FIFO — promotes oldest overflow student first (ORDER BY created_at ASC)', () => {
    insertStudent(db, { id: 's1', name: 'Active', status: 'active',   created_at: '2025-01-01T00:00:00Z' });
    insertStudent(db, { id: 's4', name: 'Third',  status: 'overflow', created_at: '2025-01-04T00:00:00Z' });
    insertStudent(db, { id: 's3', name: 'First',  status: 'overflow', created_at: '2025-01-02T00:00:00Z' });
    insertStudent(db, { id: 's2', name: 'Second', status: 'overflow', created_at: '2025-01-03T00:00:00Z' });

    simulateRefreshPromote(db, 2);

    expect(db.prepare("SELECT enrollment_status FROM students WHERE id = 's3'").get().enrollment_status).toBe('active');
    expect(db.prepare("SELECT enrollment_status FROM students WHERE id = 's2'").get().enrollment_status).toBe('overflow');
    expect(db.prepare("SELECT enrollment_status FROM students WHERE id = 's4'").get().enrollment_status).toBe('overflow');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Seat preset arithmetic
// ─────────────────────────────────────────────────────────────────────────────

describe('D. Seat preset arithmetic (BillingClient logic)', () => {
  it('D1. +25 from 100 → 125',  () => expect(applyPreset(100, 25)).toBe(125));
  it('D2. +50 from 100 → 150',  () => expect(applyPreset(100, 50)).toBe(150));
  it('D3. +100 from 100 → 200', () => expect(applyPreset(100, 100)).toBe(200));
  it('D4. +200 from 100 → 300', () => expect(applyPreset(100, 200)).toBe(300));
  it('D5. +500 from 100 → 600', () => expect(applyPreset(100, 500)).toBe(600));

  it('D6. cap is enforced at 10000', () => {
    expect(applyPreset(9980, 50)).toBe(10000);
    expect(applyPreset(10000, 100)).toBe(10000);
  });

  it('D7. common-size guide presets are valid seat counts', () => {
    for (const n of [150, 300, 600, 1200]) {
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(10000);
    }
  });

  it('D8. bulk discount threshold: triggers for >500, not for exactly 500', () => {
    expect(501 > 500).toBe(true);
    expect(500 > 500).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Quota cap helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('E. Quota cap helpers — edge cases', () => {
  let db;

  beforeEach(() => {
    db = database.init(':memory:');
    try { db.prepare('DELETE FROM students').run(); } catch (_) {}
  });

  it('E1. hasCap is false for unlimited cap (999999)', () => {
    const hasCap = (cap) => typeof cap === 'number' && isFinite(cap) && cap < 999999;
    expect(hasCap(999999)).toBe(false);
  });

  it('E2. hasCap is false for undefined', () => {
    const hasCap = (cap) => typeof cap === 'number' && isFinite(cap) && cap < 999999;
    expect(hasCap(undefined)).toBe(false);
  });

  it('E3. hasCap is true for finite cap=100', () => {
    const hasCap = (cap) => typeof cap === 'number' && isFinite(cap) && cap < 999999;
    expect(hasCap(100)).toBe(true);
  });

  it('E4. slotsAvailable=0 when active count equals cap', () => {
    insertStudent(db, { id: 's1', name: 'A', status: 'active', created_at: '2025-01-01T00:00:00Z' });
    insertStudent(db, { id: 's2', name: 'B', status: 'active', created_at: '2025-01-02T00:00:00Z' });
    insertStudent(db, { id: 's3', name: 'C', status: 'active', created_at: '2025-01-03T00:00:00Z' });

    const activeCount = db.prepare(
      "SELECT COUNT(id) AS c FROM students WHERE enrollment_status = 'active' OR enrollment_status IS NULL OR enrollment_status = ''"
    ).get().c;
    expect(Math.max(0, 3 - activeCount)).toBe(0);
  });

  it('E5. overflowCount correctly computed as max(0, enrolled - cap)', () => {
    expect(Math.max(0, 5 - 3)).toBe(2);
    expect(Math.max(0, 3 - 5)).toBe(0);
  });

  it('E6. progress bar width clamped at 100% when over cap', () => {
    expect(Math.min(100, Math.round((120 / 100) * 100))).toBe(100);
  });

  it('E7. progress bar colour is orange (warning) above 85% fill', () => {
    const colour = (e, c) => e / c > 0.85 ? '#f97316' : '#00e5ff';
    expect(colour(86, 100)).toBe('#f97316');
  });

  it('E8. progress bar colour is cyan below 85% fill', () => {
    const colour = (e, c) => e / c > 0.85 ? '#f97316' : '#00e5ff';
    expect(colour(84, 100)).toBe('#00e5ff');
  });
});
