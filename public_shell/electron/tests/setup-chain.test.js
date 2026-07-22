import { describe, it, expect } from 'vitest';
const { assertSetupChain } = require('../lib/setupChain');

function createMockDb({
  classesCount = 0, teachersCount = 0, studentsCount = 0,
  session = '2025/2026', term = 'First Term',
  termStartDate = '', termEndDate = '', resumptionDate = ''
} = {}) {
  return {
    prepare: (sql) => {
      const normSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      return {
        get: () => {
          if (normSql.includes('select count(*) as c from class_configs')) {
            return { c: classesCount };
          }
          if (normSql.includes('select count(*) as c from teachers')) {
            return { c: teachersCount };
          }
          if (normSql.includes('select count(*) as c from students')) {
            return { c: studentsCount };
          }
          if (normSql.includes('school_term_config')) {
            return {
              academic_session: session,
              term,
              term_start_date: termStartDate,
              term_end_date:   termEndDate,
              resumption_date: resumptionDate
            };
          }
          return null;
        }
      };
    }
  };
}

describe('Setup Chain Guard Tests', () => {
  it('fails at identity step on fresh empty database', () => {
    const db = createMockDb();
    const result = assertSetupChain(db, 'identity', null);
    expect(result.ok).toBe(false);
    expect(result.step).toBe('identity');
  });

  it('passes identity step when identityPacket is complete', () => {
    const db = createMockDb();
    const completeIdentity = {
      name: 'St Jude International',
      address: '123 School Way',
      motto: 'Knowledge is Light',
      phone: '08012345678',
      email: 'info@stjude.edu.ng'
    };

    const identityResult = assertSetupChain(db, 'identity', completeIdentity);
    expect(identityResult.ok).toBe(true);

    // Should now fail at classes step
    const classesResult = assertSetupChain(db, 'classes', completeIdentity);
    expect(classesResult.ok).toBe(false);
    expect(classesResult.step).toBe('classes');
  });

  it('passes classes step once a class is added', () => {
    const db = createMockDb({ classesCount: 1 });
    const completeIdentity = {
      name: 'St Jude International',
      address: '123 School Way',
      motto: 'Knowledge is Light',
      phone: '08012345678',
      email: 'info@stjude.edu.ng'
    };

    const result = assertSetupChain(db, 'classes', completeIdentity);
    expect(result.ok).toBe(true);

    // Should now fail at teachers step
    const teachersResult = assertSetupChain(db, 'teachers', completeIdentity);
    expect(teachersResult.ok).toBe(false);
    expect(teachersResult.step).toBe('teachers');
  });

  it('blocks at term step when term dates are missing', () => {
    // All roster pillars complete but term dates are empty strings (default DB state)
    const db = createMockDb({ classesCount: 1, teachersCount: 1, studentsCount: 1 });
    const identity = {
      name: 'St Jude International', address: '123 School Way',
      motto: 'Knowledge is Light', phone: '08012345678', email: 'info@stjude.edu.ng'
    };
    const result = assertSetupChain(db, 'all', identity);
    expect(result.ok).toBe(false);
    expect(result.step).toBe('term');
    expect(result.message).toContain('Term Start Date');
    expect(result.message).toContain('Term End Date');
    expect(result.message).toContain('Next Term Resumption Date');
  });

  it('passes full chain when all five term fields are populated', () => {
    const db = createMockDb({
      classesCount: 1, teachersCount: 1, studentsCount: 1,
      termStartDate: '2025-09-01', termEndDate: '2025-12-12', resumptionDate: '2026-01-06'
    });
    const identity = {
      name: 'St Jude International', address: '123 School Way',
      motto: 'Knowledge is Light', phone: '08012345678', email: 'info@stjude.edu.ng'
    };
    const result = assertSetupChain(db, 'all', identity);
    expect(result.ok).toBe(true);
  });
});

// ── Session / Term Config Foundation (real in-memory DB) ────────────────────
// These tests verify the Phase 1 Session/Term pillar: the schema must exist
// and all three calendar date fields must be writable and readable without
// data loss. Any accidental removal of an alterSafe migration would fail here
// before it silently breaks Phase 2+ resources (grades, attendance, fees).
const { database } = require('@nexus/engine');

describe('Session/Term Config Foundation (schema integrity)', () => {
  it('schema has term_start_date, term_end_date, and resumption_date columns after init', () => {
    const db = database.init(':memory:');
    const row = db.prepare('SELECT * FROM school_term_config WHERE id = 1').get();
    expect(row).toBeDefined();
    expect('term_start_date' in row).toBe(true);
    expect('term_end_date' in row).toBe(true);
    expect('resumption_date' in row).toBe(true);
  });

  it('all five session/term fields round-trip exactly without data loss', () => {
    const db = database.init(':memory:');
    db.prepare(`
      INSERT OR REPLACE INTO school_term_config
        (id, academic_session, term, term_start_date, term_end_date, resumption_date)
      VALUES (1, '2025/2026', 'Second Term', '2026-01-06', '2026-04-03', '2026-01-06')
    `).run();
    const row = db.prepare('SELECT * FROM school_term_config WHERE id = 1').get();
    expect(row.academic_session).toBe('2025/2026');
    expect(row.term).toBe('Second Term');
    expect(row.term_start_date).toBe('2026-01-06');
    expect(row.term_end_date).toBe('2026-04-03');
    expect(row.resumption_date).toBe('2026-01-06');
  });
});
