import { describe, it, expect, beforeEach } from 'vitest';
const { database } = require('@nexus/engine');

describe('Phase 5 — Multi-Department Manager Signatures', () => {
  let db;

  beforeEach(() => {
    db = database.init(':memory:');
    try {
      db.prepare('DELETE FROM department_managers').run();
    } catch (_) {}
  });

  it('creates department_managers table and performs CRUD operations', () => {
    // 1. CREATE (Insert)
    const insertStmt = db.prepare(`
      INSERT INTO department_managers (section_name, class_prefixes, manager_title, manager_name, sign_base64)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const secRes = insertStmt.run(
      'Secondary',
      JSON.stringify(['JSS', 'SSS']),
      'Principal',
      'Dr. A. B. Cole',
      'data:image/png;base64,fakeSecSig'
    );
    expect(secRes.lastInsertRowid).toBeDefined();

    const primRes = insertStmt.run(
      'Primary',
      JSON.stringify(['Primary', 'Basic']),
      'Headmaster',
      'Mrs. C. D. Adeleke',
      'data:image/png;base64,fakePrimSig'
    );
    expect(primRes.lastInsertRowid).toBeDefined();

    // 2. READ (List)
    const managers = db.prepare('SELECT * FROM department_managers ORDER BY id ASC').all();
    expect(managers.length).toBe(2);
    expect(managers[0].section_name).toBe('Secondary');
    expect(managers[0].manager_title).toBe('Principal');
    expect(managers[1].section_name).toBe('Primary');
    expect(managers[1].manager_title).toBe('Headmaster');

    // 3. UPDATE
    db.prepare(`
      UPDATE department_managers
      SET manager_name = ?, updated_at = datetime('now')
      WHERE section_name = ?
    `).run('Dr. A. B. Cole (Ph.D)', 'Secondary');

    const updatedSec = db.prepare('SELECT * FROM department_managers WHERE section_name = ?').get('Secondary');
    expect(updatedSec.manager_name).toBe('Dr. A. B. Cole (Ph.D)');

    // 4. DELETE
    db.prepare('DELETE FROM department_managers WHERE id = ?').run(primRes.lastInsertRowid);
    const afterDelete = db.prepare('SELECT * FROM department_managers').all();
    expect(afterDelete.length).toBe(1);
    expect(afterDelete[0].section_name).toBe('Secondary');
  });

  it('correctly resolves section managers by class prefix', () => {
    const managers = [
      {
        id: 1,
        section_name: 'Secondary',
        class_prefixes: JSON.stringify(['JSS', 'SSS', 'Senior']),
        manager_title: 'Principal',
        manager_name: 'Dr. Cole',
        sign_base64: 'data:image/png;base64,secSig'
      },
      {
        id: 2,
        section_name: 'Primary',
        class_prefixes: JSON.stringify(['Primary', 'Basic']),
        manager_title: 'Headmaster',
        manager_name: 'Mr. Adeleke',
        sign_base64: 'data:image/png;base64,primSig'
      },
      {
        id: 3,
        section_name: 'Nursery',
        class_prefixes: JSON.stringify(['Nursery', 'KG', 'Creche']),
        manager_title: 'Nursery Manager',
        manager_name: 'Mrs. Bello',
        sign_base64: 'data:image/png;base64,nurserySig'
      }
    ];

    const defaultFallback = {
      manager_title: 'Principal',
      manager_name: 'General Principal',
      sign_base64: 'data:image/png;base64,defaultSig'
    };

    function resolveManager(className, mgrs, fallback) {
      if (!className || !Array.isArray(mgrs) || mgrs.length === 0) return fallback;
      const normClassName = className.replace(/\s+/g, '').toUpperCase();
      for (const mgr of mgrs) {
        let prefixes = [];
        try {
          prefixes = typeof mgr.class_prefixes === 'string' ? JSON.parse(mgr.class_prefixes) : (mgr.class_prefixes || []);
        } catch (_) { prefixes = []; }
        if (Array.isArray(prefixes)) {
          for (const p of prefixes) {
            const normPrefix = p.replace(/\s+/g, '').toUpperCase();
            if (normPrefix && normClassName.startsWith(normPrefix)) {
              return mgr;
            }
          }
        }
      }
      return fallback;
    }

    // Secondary test
    expect(resolveManager('JSS 1 A', managers, defaultFallback).manager_title).toBe('Principal');
    expect(resolveManager('SSS 2 Gold', managers, defaultFallback).manager_name).toBe('Dr. Cole');

    // Primary test
    expect(resolveManager('Primary 3 B', managers, defaultFallback).manager_title).toBe('Headmaster');
    expect(resolveManager('Basic 5', managers, defaultFallback).manager_name).toBe('Mr. Adeleke');

    // Nursery test
    expect(resolveManager('Nursery 2 Red', managers, defaultFallback).manager_title).toBe('Nursery Manager');
    expect(resolveManager('KG 1', managers, defaultFallback).manager_name).toBe('Mrs. Bello');

    // Case-insensitivity & whitespace tolerance
    expect(resolveManager('  jss  3  ', managers, defaultFallback).manager_title).toBe('Principal');

    // Unmatched class fallback test
    expect(resolveManager('Grade 10', managers, defaultFallback).manager_title).toBe('Principal');
    expect(resolveManager('Grade 10', managers, defaultFallback).manager_name).toBe('General Principal');
  });
});
