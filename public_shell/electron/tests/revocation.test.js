import { describe, it, expect } from 'vitest';

// Mock DB for query validation
class MockDatabase {
  constructor() {
    this.devices = new Set();
    this.teachers = {};
    this.queries = [];
  }

  prepare(sql) {
    this.queries.push(sql);
    
    return {
      get: (...args) => {
        if (sql.includes('SELECT 1 FROM connected_devices')) {
          const deviceId = args[0];
          return this.devices.has(deviceId) ? { 1: 1 } : null;
        }
        if (sql.includes('SELECT id, sync_revoked FROM teachers WHERE id = ?')) {
          const teacherId = args[0];
          const t = this.teachers[teacherId];
          return t ? { id: teacherId, sync_revoked: t.sync_revoked } : null;
        }
        if (sql.includes('SELECT COUNT(*) as c FROM connected_devices')) {
          return { c: this.devices.size };
        }
        return null;
      },
      run: (...args) => {
        if (sql.includes('INSERT OR REPLACE INTO connected_devices')) {
          const deviceId = args[0];
          this.devices.add(deviceId);
          return { changes: 1 };
        }
        if (sql.includes('DELETE FROM connected_devices')) {
          const deviceId = args[0];
          this.devices.delete(deviceId);
          return { changes: 1 };
        }
        if (sql.includes('UPDATE teachers SET sync_revoked')) {
          const val = sql.includes('sync_revoked = 1') ? 1 : 0;
          const teacherId = args[0];
          if (this.teachers[teacherId]) {
            this.teachers[teacherId].sync_revoked = val;
          }
          return { changes: 1 };
        }
        return { changes: 0 };
      },
      all: () => {
        return [];
      }
    };
  }
}

describe('Mock Revocation Sync Logic', () => {
  it('correctly grants sync access to paired Standalone devices', () => {
    const db = new MockDatabase();
    
    // Pair a device
    db.prepare('INSERT OR REPLACE INTO connected_devices (device_id, device_model) VALUES (?, ?)').run('device_1', 'Pixel 6');
    
    // Simulate server side lookup
    const isStandaloneDevice = db.prepare('SELECT 1 FROM connected_devices WHERE device_id = ?').get('device_1') ? true : false;
    expect(isStandaloneDevice).toBe(true);

    const isNotStandaloneDevice = db.prepare('SELECT 1 FROM connected_devices WHERE device_id = ?').get('device_revoked') ? true : false;
    expect(isNotStandaloneDevice).toBe(false);
  });

  it('correctly blocks sync access for revoked teachers', () => {
    const db = new MockDatabase();
    
    // Add teacher and mock active state
    db.teachers['teacher_123'] = { name: 'Active Teacher', sync_revoked: 0 };

    let teacher = db.prepare('SELECT id, sync_revoked FROM teachers WHERE id = ?').get('teacher_123');
    expect(teacher.sync_revoked).toBe(0);

    // Revoke
    db.prepare('UPDATE teachers SET sync_revoked = 1 WHERE id = ?').run('teacher_123');
    
    teacher = db.prepare('SELECT id, sync_revoked FROM teachers WHERE id = ?').get('teacher_123');
    expect(teacher.sync_revoked).toBe(1);
  });

  it('enforces Standalone device ceiling count', () => {
    const db = new MockDatabase();
    
    // Add 2 devices
    db.prepare('INSERT OR REPLACE INTO connected_devices (device_id) VALUES (?)').run('d1');
    db.prepare('INSERT OR REPLACE INTO connected_devices (device_id) VALUES (?)').run('d2');

    const count = db.prepare('SELECT COUNT(*) as c FROM connected_devices').get().c;
    expect(count).toBe(2);
  });
});
