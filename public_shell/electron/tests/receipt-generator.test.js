/**
 * tests/receipt-generator.test.js
 *
 * Tests for the branded PDF receipt generator (receipt-generator.js).
 * Verifies:
 *   - generateReceiptPdf() resolves to a non-empty Buffer
 *   - Output is valid PDF (starts with %PDF magic bytes)
 *   - Works when schoolLogoB64 is omitted (fallback header path)
 *   - Works when allocations list is empty
 *   - Handles corrupt logo base64 gracefully (try/catch in generator)
 *   - Larger allocations set produces a larger PDF
 */
import { describe, it, expect } from 'vitest';

// pdfkit is a pure Node.js dependency — Vitest runs in Node, so we can import real module.
const { generateReceiptPdf } = require('../receipt-generator');

const BASE_DATA = {
  schoolName:      'Nexus Academy',
  schoolAddress:   '1 School Lane, Lagos',
  schoolPhone:     '08012345678',
  studentName:     'Ada Okonkwo',
  studentClass:    'JSS 2B',
  academicSession: '2025/2026',
  term:            'Third Term',
  reference:       'PAY-TEST-001',
  paymentDate:     '06/07/2026',
  paymentMethod:   'Paystack Online',
  amountPaid:      15000,
  allocations: [
    { name: 'School Fees',   amount: 10000, balance: 0 },
    { name: 'Computer Levy', amount:  5000, balance: 0 },
  ],
};

describe('Receipt PDF Generator', () => {
  it('resolves to a non-empty Buffer', async () => {
    const buf = await generateReceiptPdf(BASE_DATA);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(500);
  });

  it('output begins with the PDF magic bytes (%PDF)', async () => {
    const buf = await generateReceiptPdf(BASE_DATA);
    const header = buf.subarray(0, 4).toString('ascii');
    expect(header).toBe('%PDF');
  });

  it('works when schoolLogoB64 is not provided (fallback drawDefaultHeader path)', async () => {
    const buf = await generateReceiptPdf({ ...BASE_DATA, schoolLogoB64: undefined });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(500);
  });

  it('works when allocations array is empty', async () => {
    const buf = await generateReceiptPdf({ ...BASE_DATA, allocations: [] });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(500);
  });

  it('falls back gracefully when schoolLogoB64 is an invalid base64 string', async () => {
    // The generator wraps logo decode in try/catch — must not reject
    await expect(generateReceiptPdf({ ...BASE_DATA, schoolLogoB64: 'NOT_VALID_BASE64!!!' }))
      .resolves.toBeInstanceOf(Buffer);
  });

  it('produces a larger buffer when there are more allocation rows', async () => {
    const sparse = await generateReceiptPdf({ ...BASE_DATA, allocations: [] });
    const rich   = await generateReceiptPdf({
      ...BASE_DATA,
      allocations: Array.from({ length: 10 }, (_, i) => ({
        name: `Fee Item ${i + 1}`, amount: 1000 * (i + 1), balance: 0,
      })),
    });
    expect(rich.length).toBeGreaterThan(sparse.length);
  });
});
