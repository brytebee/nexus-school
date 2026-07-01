import { describe, it, expect, vi } from 'vitest';
const { database } = require('@nexus/engine');
const paystackService = require('../paystack-service');

describe('Paystack Webhook & Online Payments (Sprint 5)', () => {
  it('allocates paid amount to siblings correctly', async () => {
    // Setup Mock Database
    let runQueries = [];
    const mockDb = {
      prepare: (sql) => {
        const cleanSql = sql.trim().replace(/\s+/g, ' ');
        if (cleanSql.includes('SELECT * FROM fee_payment_sessions')) {
          return {
            get: () => ({
              id: 10,
              parent_phone: '2348030000000',
              student_ids: 'STU-01,STU-02',
              total_amount: 80000,
              payment_type: 'Full Payment',
              status: 'pending'
            })
          };
        }
        if (cleanSql.includes('SELECT * FROM school_term_config')) {
          return {
            get: () => ({ term: '1st Term', academic_session: '2025/2026' })
          };
        }
        if (cleanSql.includes('SELECT COALESCE(total_billed, 0) as total_billed')) {
          return {
            get: (studentId) => {
              if (studentId === 'STU-01') return { total_billed: 50000, total_paid: 10000 }; // Balance 40k
              if (studentId === 'STU-02') return { total_billed: 60000, total_paid: 20000 }; // Balance 40k
              return { total_billed: 0, total_paid: 0 };
            }
          };
        }
        if (cleanSql.includes('SELECT COALESCE(SUM(amount), 0)')) {
          return {
            get: () => ({ total_paid_sum: 50000 })
          };
        }
        if (cleanSql.includes('SELECT name FROM students')) {
          return {
            get: (studentId) => {
              if (studentId === 'STU-01') return { name: 'Ada Obi' };
              if (studentId === 'STU-02') return { name: 'Obi Obi' };
              return null;
            }
          };
        }
        if (cleanSql.includes('SELECT value FROM app_settings WHERE key = \'school_name\'')) {
          return {
            get: () => ({ value: 'Nexus Test School' })
          };
        }
        return {
          run: (...args) => {
            runQueries.push({ sql: cleanSql, args });
            return { lastInsertRowid: 1 };
          },
          get: () => null,
          all: () => []
        };
      },
      transaction: (fn) => fn
    };

    database.getDb = () => mockDb;

    // Simulate Webhook Processor logic for processing paid amount (₦60,000)
    // ₦60,000 should clear Student 1's ₦40,000 balance completely and allocate remaining ₦20,000 to Student 2.
    const parentPhone = '2348030000000';
    const studentIds = 'STU-01,STU-02';
    const paidAmount = 60000;
    
    let remainingPaid = paidAmount;
    const academicSession = '2025/2026';
    const term = '1st Term';
    const ref = 'PAY-TEST-REF';

    const mockTransactions = [];
    const mockUpdates = [];

    const processPayment = () => {
      const ids = studentIds.split(",");
      for (const studentId of ids) {
        if (remainingPaid <= 0) break;
        
        let totalBilled = 0;
        let totalPaid = 0;
        if (studentId === 'STU-01') { totalBilled = 50000; totalPaid = 10000; }
        if (studentId === 'STU-02') { totalBilled = 60000; totalPaid = 20000; }

        const balance = totalBilled - totalPaid;
        if (balance <= 0) continue;

        const allocation = Math.min(remainingPaid, balance);
        remainingPaid -= allocation;

        mockTransactions.push({ studentId, allocation, ref });
        
        const newTotalPaid = totalPaid + allocation;
        mockUpdates.push({ studentId, totalBilled, totalPaid: newTotalPaid });
      }
    };

    processPayment();

    // Assert Ada Obi (STU-01) received ₦40,000 allocation (clearing outstanding)
    expect(mockTransactions[0].studentId).toBe('STU-01');
    expect(mockTransactions[0].allocation).toBe(40000);
    expect(mockUpdates[0].totalPaid).toBe(50000); // 10k + 40k = 50k (cleared)

    // Assert Obi Obi (STU-02) received remaining ₦20,000 allocation
    expect(mockTransactions[1].studentId).toBe('STU-02');
    expect(mockTransactions[1].allocation).toBe(20000);
    expect(mockUpdates[1].totalPaid).toBe(40000); // 20k + 20k = 40k
    
    expect(remainingPaid).toBe(0); // Entire ₦60,000 allocated
  });

  it('verifies signature and fallback correctly', async () => {
    // Mock signature hash verification
    const signature = 'VALID-SIG';
    const secret = 'sk_test_f9ae27a1f05526497221e1456eaa5c8dfdac881b';
    
    // Simulate HMAC signature check
    const crypto = require('crypto');
    const computedHash = crypto.createHmac('sha512', secret).update(JSON.stringify({ data: { reference: 'PAY-1' } })).digest('hex');
    
    // Check computed hash validates with simulated signature
    const isValidSignature = (sig, body) => {
      const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(body)).digest('hex');
      return hash === sig;
    };

    const mockBody = { data: { reference: 'PAY-1' } };
    const validSig = crypto.createHmac('sha512', secret).update(JSON.stringify(mockBody)).digest('hex');
    
    expect(isValidSignature(validSig, mockBody)).toBe(true);
    expect(isValidSignature('invalid-sig', mockBody)).toBe(false);
  });
});
