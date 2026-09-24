/**
 * receipt-generator.js
 * In-memory branded PDF generator for Nexus School OS using pdfkit.
 */
"use strict";

const PDFDocument = require('pdfkit');

/**
 * Generates an in-memory PDF buffer for a payment receipt.
 * @param {Object} data 
 * @returns {Promise<Buffer>}
 */
function generateReceiptPdf(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      // Draw primary theme color top border accent
      doc.rect(0, 0, 595.28, 15).fill('#b8860b'); // Dark Goldenrod

      // School Branding Header
      let headerY = 35;
      if (data.schoolLogoB64) {
        try {
          // Strip the data URI prefix ("data:image/...;base64,") if present —
          // Buffer.from() requires raw base64, not a data URI string.
          const rawB64 = data.schoolLogoB64.includes(',') 
            ? data.schoolLogoB64.split(',')[1] 
            : data.schoolLogoB64;
          const logoBuffer = Buffer.from(rawB64, 'base64');
          doc.image(logoBuffer, 40, headerY, { width: 60, height: 60 });
          doc.fillColor('#0f172a') // Slate 900
             .fontSize(18)
             .font('Helvetica-Bold')
             .text(data.schoolName || "The School", 115, headerY);
          
          const contactParts = [];
          if (data.schoolPhone && data.schoolPhone !== "—") contactParts.push(`Tel: ${data.schoolPhone}`);
          contactParts.push('Official School Receipt');

          doc.fillColor('#475569') // Slate 600
             .fontSize(9)
             .font('Helvetica');

          if (data.schoolAddress && data.schoolAddress !== "School Address") {
            doc.text(data.schoolAddress, 115, headerY + 22, { width: 440 });
            doc.text(contactParts.join('  ·  '), 115, headerY + 38, { width: 440 });
          } else {
            doc.text(contactParts.join('  ·  '), 115, headerY + 24, { width: 440 });
          }
        } catch (_) {
          // Fallback if logo corrupt
          drawDefaultHeader(doc, data, headerY);
        }
      } else {
        drawDefaultHeader(doc, data, headerY);
      }

      // Receipt Title Banner
      const isOnline = data.paymentMethod && (data.paymentMethod.toLowerCase().includes('online') || data.paymentMethod.toLowerCase().includes('paystack'));
      const bannerTitle = isOnline ? 'OFFICIAL ONLINE PAYMENT RECEIPT' : 'OFFICIAL PAYMENT RECEIPT';

      doc.rect(40, 115, 515, 30).fill('#0f172a');
      doc.fillColor('#ffffff')
         .fontSize(11)
         .font('Helvetica-Bold')
         .text(bannerTitle, 50, 124);

      // Metainfo sections
      doc.fillColor('#0f172a').font('Helvetica');

      // Left Column: Bill To (Parent/Guardian) & Beneficiary info
      let infoY = 155;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b').text('BILL TO:', 40, infoY);

      const billToName = data.parentName?.trim() || 'Dear Parent';
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a')
         .text(billToName, 40, infoY + 14, { width: 260 });

      let currentLeftY = infoY + 30;
      if (data.studentName && data.studentName !== billToName) {
        const isMulti = (data.studentName || '').includes(',');
        const studentLabel = isMulti
          ? `Wards: ${data.studentName.split(',').length} Students (See Details Below)`
          : `Student: ${data.studentName}`;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#334155')
           .text(studentLabel, 40, currentLeftY, { width: 260 });
        currentLeftY += 13;
      }

      doc.fontSize(9).font('Helvetica').fillColor('#475569')
         .text(`Class: ${data.studentClass || "—"}`, 40, currentLeftY, { width: 260 });
      currentLeftY += 13;
      doc.text(`Session: ${data.academicSession || "—"} | Term: ${data.term || "—"}`, 40, currentLeftY, { width: 260 });
      currentLeftY += 13;
      if (data.parentEmail && data.parentEmail !== "—") {
        doc.text(`Email: ${data.parentEmail}`, 40, currentLeftY, { width: 260 });
      }

      // Right Column: Payment Details
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b').text('TRANSACTION DETAILS:', 320, infoY);
      doc.fontSize(8.5).font('Helvetica').fillColor('#64748b').text(`Receipt Reference:`, 320, infoY + 14);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a').text(data.reference || "—", 320, infoY + 26, { width: 235 });

      const dateY = infoY + 44;
      doc.fontSize(9).font('Helvetica').fillColor('#475569').text(`Date Paid:`, 320, dateY);
      doc.font('Helvetica-Bold').fillColor('#0f172a').text(data.paymentDate || new Date().toLocaleDateString('en-NG'), 405, dateY, { width: 150 });

      const methodY = infoY + 58;
      doc.font('Helvetica').fillColor('#475569').text(`Payment Method:`, 320, methodY);
      doc.font('Helvetica-Bold').fillColor('#0f172a').text(data.paymentMethod || "Paystack Online", 405, methodY, { width: 150 });

      // Allocation Table Header
      let tableY = 235;
      doc.rect(40, tableY, 515, 20).fill('#f8fafc');
      doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold')
        .text('Student / Item Allocation', 50, tableY + 6)
        .text('Allocated (NGN)', 320, tableY + 6, { width: 100, align: 'right' })
        .text('Remaining Balance (NGN)', 440, tableY + 6, { width: 110, align: 'right' });

      // Allocation Table Rows
      let currentY = tableY + 20;
      const allocations = data.allocations || [];
      
      allocations.forEach((alloc, idx) => {
        // Alternating row background
        if (idx % 2 === 1) {
          doc.rect(40, currentY, 515, 22).fill('#f8fafc');
        }
        
        doc.fillColor('#0f172a').fontSize(9).font('Helvetica')
           .text(alloc.name, 50, currentY + 7)
           .font('Helvetica-Bold').text(Number(alloc.amount || 0).toLocaleString('en-NG'), 320, currentY + 7, { width: 100, align: 'right' })
           .font('Helvetica').text(Number(alloc.balance || 0).toLocaleString('en-NG'), 440, currentY + 7, { width: 110, align: 'right' });
        
        // Draw line separator
        doc.moveTo(40, currentY + 22).lineTo(555, currentY + 22).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        currentY += 22;
      });

      // Total summary block
      currentY += 12;
      doc.rect(320, currentY, 235, 45).fill('#0f172a');
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
         .text('TOTAL PAID (NGN)', 335, currentY + 16)
         .fontSize(13).text(Number(data.amountPaid || 0).toLocaleString('en-NG'), 415, currentY + 15, { width: 130, align: 'right' });
      currentY += 45;

      // ── Phase 8: Fee Breakdown Section ──────────────────────────────────────
      const feeItems = data.feeItems || [];
      if (feeItems.length > 0) {
        currentY += 24;

        // Section header
        doc.rect(40, currentY, 515, 20).fill('#1e293b');
        doc.fillColor('#94a3b8').fontSize(9).font('Helvetica-Bold')
           .text('FEE BREAKDOWN', 50, currentY + 6)
           .text('Amount (NGN)', 440, currentY + 6, { width: 110, align: 'right' });

        currentY += 20;

        const mandatory = feeItems.filter(f => f.type === 'mandatory');
        const extras = feeItems.filter(f => f.type === 'extra');

        // Mandatory fee items
        if (mandatory.length > 0) {
          doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold')
             .text('SCHOOL FEES', 50, currentY + 5);
          currentY += 16;

          mandatory.forEach((item, idx) => {
            if (idx % 2 === 0) {
              doc.rect(40, currentY, 515, 18).fill('#f8fafc');
            }
            const label = item.bankLabel ? `${item.name}  ·  ${item.bankLabel}` : item.name;
            doc.fillColor('#334155').fontSize(9).font('Helvetica')
               .text(label, 58, currentY + 4)
               .font('Helvetica-Bold').text(Number(item.amount || 0).toLocaleString('en-NG'), 440, currentY + 4, { width: 110, align: 'right' });
            doc.moveTo(40, currentY + 18).lineTo(555, currentY + 18).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            currentY += 18;
          });
        }

        // Optional/extras items
        if (extras.length > 0) {
          currentY += 6;
          doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold')
             .text('OPTIONAL ITEMS', 50, currentY + 5);
          currentY += 16;

          extras.forEach((item, idx) => {
            if (idx % 2 === 0) {
              doc.rect(40, currentY, 515, 18).fill('#f8fafc');
            }
            const name = item.name.replace(' (Optional)', '');
            doc.fillColor('#334155').fontSize(9).font('Helvetica')
               .text(name, 58, currentY + 4)
               .font('Helvetica-Bold').text(Number(item.amount || 0).toLocaleString('en-NG'), 440, currentY + 4, { width: 110, align: 'right' });
            doc.moveTo(40, currentY + 18).lineTo(555, currentY + 18).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            currentY += 18;
          });
        }
      }

      // Footer notice / Seal
      currentY += 35;
      doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      
      doc.fillColor('#64748b').fontSize(8).font('Helvetica')
         .text('This receipt was generated automatically by Nexus School OS.', 40, currentY + 12, { align: 'center', width: 515 })
         .text('Thank you for your payment. For inquiries, please contact the school administration.', 40, currentY + 24, { align: 'center', width: 515 });

      doc.end();

    } catch (err) {
      reject(err);
    }
  });
}

function drawDefaultHeader(doc, data, headerY) {
  doc.fillColor('#0f172a')
     .fontSize(18)
     .font('Helvetica-Bold')
     .text(data.schoolName || "The School", 40, headerY, { width: 515 });
  
  const contactParts = [];
  if (data.schoolPhone && data.schoolPhone !== "—") contactParts.push(`Tel: ${data.schoolPhone}`);
  contactParts.push('Official School Receipt');

  doc.fillColor('#475569')
     .fontSize(9)
     .font('Helvetica');

  if (data.schoolAddress && data.schoolAddress !== "School Address") {
    doc.text(data.schoolAddress, 40, headerY + 22, { width: 515 });
    doc.text(contactParts.join('  ·  '), 40, headerY + 38, { width: 515 });
  } else {
    doc.text(contactParts.join('  ·  '), 40, headerY + 24, { width: 515 });
  }
}

module.exports = {
  generateReceiptPdf,
};
