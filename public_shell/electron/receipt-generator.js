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
          const logoBuffer = Buffer.from(data.schoolLogoB64, 'base64');
          doc.image(logoBuffer, 40, headerY, { width: 60, height: 60 });
          doc.fillColor('#0f172a') // Slate 900
             .fontSize(18)
             .font('Helvetica-Bold')
             .text(data.schoolName || "The School", 115, headerY);
          
          doc.fillColor('#475569') // Slate 600
             .fontSize(9)
             .font('Helvetica')
             .text(data.schoolAddress || "School Address", 115, headerY + 22, { width: 440 })
             .text(`Phone: ${data.schoolPhone || "—"} | Email: Support`, 115, headerY + 42);
        } catch (_) {
          // Fallback if logo corrupt
          drawDefaultHeader(doc, data, headerY);
        }
      } else {
        drawDefaultHeader(doc, data, headerY);
      }

      // Receipt Title Banner
      doc.rect(40, 115, 515, 30).fill('#0f172a');
      doc.fillColor('#ffffff')
         .fontSize(11)
         .font('Helvetica-Bold')
         .text('OFFICIAL ONLINE PAYMENT RECEIPT', 50, 124);

      // Metainfo sections
      doc.fillColor('#0f172a').font('Helvetica');

      // Left Column: Bill To / Student info
      let infoY = 160;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#64748b').text('BILL TO:', 40, infoY);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text(data.studentName || "Student Name", 40, infoY + 15);
      doc.fontSize(9).font('Helvetica').fillColor('#475569')
         .text(`Class: ${data.studentClass || "—"}`, 40, infoY + 30)
         .text(`Session: ${data.academicSession || "—"} | Term: ${data.term || "—"}`, 40, infoY + 43);

      // Right Column: Payment Details
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#64748b').text('TRANSACTION DETAILS:', 320, infoY);
      doc.fontSize(9).font('Helvetica').fillColor('#475569')
         .text(`Receipt Reference:`, 320, infoY + 15)
         .font('Helvetica-Bold').fillColor('#0f172a').text(data.reference || "—", 420, infoY + 15)
         .font('Helvetica').fillColor('#475569')
         .text(`Date Paid:`, 320, infoY + 28)
         .fillColor('#0f172a').text(data.paymentDate || new Date().toLocaleDateString('en-NG'), 420, infoY + 28)
         .fillColor('#475569')
         .text(`Payment Method:`, 320, infoY + 41)
         .fillColor('#0f172a').text(data.paymentMethod || "Paystack Online", 420, infoY + 41);

      // Allocation Table Header
      let tableY = 230;
      doc.rect(40, tableY, 515, 20).fill('#f8fafc');
      doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold')
         .text('Student / Item Allocation', 50, tableY + 6)
         .text('Allocated (₦)', 320, tableY + 6, { width: 100, align: 'right' })
         .text('Remaining Balance (₦)', 440, tableY + 6, { width: 110, align: 'right' });

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
      currentY += 10;
      doc.rect(320, currentY, 235, 45).fill('#0f172a');
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
         .text('TOTAL PAID (₦)', 335, currentY + 16)
         .fontSize(13).text(Number(data.amountPaid || 0).toLocaleString('en-NG'), 415, currentY + 15, { width: 130, align: 'right' });

      // Footer notice / Seal
      currentY += 75;
      doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      
      doc.fillColor('#64748b').fontSize(8).font('Helvetica')
         .text('This receipt was generated automatically by Nexus School OS.', 40, currentY + 10, { align: 'center' })
         .text('Thank you for your payment. For inquiries, please contact the school administration.', 40, currentY + 22, { align: 'center' });

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
     .text(data.schoolName || "The School", 40, headerY);
  
  doc.fillColor('#475569')
     .fontSize(9)
     .font('Helvetica')
     .text(data.schoolAddress || "School Address", 40, headerY + 22, { width: 515 })
     .text(`Phone: ${data.schoolPhone || "—"}`, 40, headerY + 42);
}

module.exports = {
  generateReceiptPdf,
};
