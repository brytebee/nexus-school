import { describe, it, expect } from 'vitest';
const { database } = require('@nexus/engine');
const { sendFeeStatus } = require('../pulse-bot.js');

describe('WhatsApp Fee Breakdown (Sprint 1)', () => {
  it('renders breakdown when itemised fee structure exists (same and different classes)', async () => {
    // Set up mock DB queries
    const mockDb = {
      prepare: (sql) => {
        const cleanSql = sql.trim().replace(/\s+/g, ' ');
        
        if (cleanSql.includes('SELECT total_billed, total_paid FROM student_fees')) {
          return {
            get: (studentId, session, term) => {
              if (studentId === 'STU-01') return { total_billed: 85000, total_paid: 10000 };
              if (studentId === 'STU-02') return { total_billed: 85000, total_paid: 85000 };
              if (studentId === 'STU-03') return { total_billed: 120000, total_paid: 0 };
              return null;
            }
          };
        }
        
        if (cleanSql.includes('SELECT item_name, amount FROM fee_structures')) {
          return {
            all: (className, term) => {
              if (className === 'JSS 1 Gold') {
                return [
                  { item_name: 'Tuition Fee', amount: 60000 },
                  { item_name: 'Textbooks', amount: 25000 }
                ];
              }
              if (className === 'SS 2 Emerald') {
                return [
                  { item_name: 'Tuition Fee', amount: 90000 },
                  { item_name: 'Lab Practical', amount: 30000 }
                ];
              }
              return [];
            }
          };
        }
        
        if (cleanSql.includes('SELECT value FROM app_settings WHERE key = \'fee_settings\'')) {
          return {
            get: () => ({ value: JSON.stringify({ bank_accounts: [] }) })
          };
        }
        
        return { get: () => null, all: () => [] };
      }
    };

    database.getDb = () => mockDb;

    // Mock msg
    let repliedText = '';
    const mockMsg = {
      reply: async (text) => {
        repliedText = text;
      }
    };

    // Mock session
    const mockSession = {
      schoolName: 'Test Academy',
      termConfig: { term: '1st Term', academic_session: '2025/2026' },
      students: [
        { id: 'STU-01', name: 'Amara Obi', class_name: 'JSS 1', class_arm: 'Gold' },
        { id: 'STU-02', name: 'Chinedu Obi', class_name: 'JSS 1', class_arm: 'Gold' },
        { id: 'STU-03', name: 'Kelechi Obi', class_name: 'SS 2', class_arm: 'Emerald' }
      ]
    };

    await sendFeeStatus(mockMsg, mockSession, null);

    expect(repliedText).toContain('Amara Obi');
    expect(repliedText).toContain('Chinedu Obi');
    expect(repliedText).toContain('Kelechi Obi');

    // Verify breakdown items for JSS 1 Gold (Amara and Chinedu)
    expect(repliedText).toContain('• Tuition Fee: ₦60,000');
    expect(repliedText).toContain('• Textbooks: ₦25,000');

    // Verify breakdown items for SS 2 Emerald (Kelechi)
    expect(repliedText).toContain('• Lab Practical: ₦30,000');

    // Verify statuses
    expect(repliedText).toContain('Fees Cleared ✅');
    expect(repliedText).toContain('Outstanding Balance ⚠️');
  });

  it('falls back gracefully to totals-only if no fee structure is defined for a class', async () => {
    const mockDb = {
      prepare: (sql) => {
        const cleanSql = sql.trim().replace(/\s+/g, ' ');
        if (cleanSql.includes('SELECT total_billed, total_paid FROM student_fees')) {
          return {
            get: (studentId) => {
              if (studentId === 'STU-99') return { total_billed: 50000, total_paid: 10000 };
              return null;
            }
          };
        }
        if (cleanSql.includes('SELECT item_name, amount FROM fee_structures')) {
          return {
            all: () => [] // Empty breakdown
          };
        }
        if (cleanSql.includes('SELECT value FROM app_settings WHERE key = \'fee_settings\'')) {
          return {
            get: () => ({ value: JSON.stringify({ bank_accounts: [] }) })
          };
        }
        return { get: () => null, all: () => [] };
      }
    };

    database.getDb = () => mockDb;

    let repliedText = '';
    const mockMsg = {
      reply: async (text) => {
        repliedText = text;
      }
    };

    const mockSession = {
      schoolName: 'Test Academy',
      termConfig: { term: '1st Term', academic_session: '2025/2026' },
      students: [
        { id: 'STU-99', name: 'Only Child', class_name: 'JSS 3', class_arm: null }
      ]
    };

    await sendFeeStatus(mockMsg, mockSession, null);

    expect(repliedText).not.toContain('📋 *Fee Breakdown*:');
    expect(repliedText).toContain('Only Child');
    expect(repliedText).toContain('Billed : ₦50,000');
    expect(repliedText).toContain('Balance: ₦40,000');
  });
});
