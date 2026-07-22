import { describe, it, expect } from 'vitest';
const { assertSetupChain } = require('../lib/setupChain');
const { database } = require('@nexus/engine');

describe('Phase 2 Downstream Setup Chain Guards', () => {
  it('blocks downstream operations when term configuration is incomplete or dates are missing', () => {
    const db = database.init(':memory:');
    
    // Seed identity, classes, teachers, students so step 'term' is reached
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('school_identity', ?)").run(JSON.stringify({
      name: 'St Jude Academy',
      address: '123 Main St',
      motto: 'Excellence',
      phone: '08012345678',
      email: 'info@stjude.edu'
    }));
    db.prepare("INSERT INTO class_configs (class_name) VALUES ('JSS 1')").run();
    db.prepare("INSERT INTO teachers (id, name) VALUES ('T1', 'Teacher One')").run();
    db.prepare("INSERT INTO students (id, name, class_name) VALUES ('S1', 'Student One', 'JSS 1')").run();

    // Partial term config (missing dates)
    db.prepare("INSERT OR REPLACE INTO school_term_config (id, academic_session, term) VALUES (1, '2025/2026', 'First Term')").run();

    const check = assertSetupChain(db, 'term');
    expect(check.ok).toBe(false);
    expect(check.error).toBe('SETUP_INCOMPLETE');
    expect(check.step).toBe('term');
    expect(check.message).toContain('Term Start Date');
  });

  it('allows downstream operations when all 5 session/term calendar fields are complete', () => {
    const db = database.init(':memory:');

    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('school_identity', ?)").run(JSON.stringify({
      name: 'St Jude Academy',
      address: '123 Main St',
      motto: 'Excellence',
      phone: '08012345678',
      email: 'info@stjude.edu'
    }));
    db.prepare("INSERT INTO class_configs (class_name) VALUES ('JSS 1')").run();
    db.prepare("INSERT INTO teachers (id, name) VALUES ('T1', 'Teacher One')").run();
    db.prepare("INSERT INTO students (id, name, class_name) VALUES ('S1', 'Student One', 'JSS 1')").run();

    // Complete term config with all 5 fields
    db.prepare(`
      INSERT OR REPLACE INTO school_term_config 
        (id, academic_session, term, term_start_date, term_end_date, resumption_date)
      VALUES (1, '2025/2026', 'First Term', '2025-09-08', '2025-12-19', '2026-01-05')
    `).run();

    const check = assertSetupChain(db, 'term');
    expect(check.ok).toBe(true);
  });
});
