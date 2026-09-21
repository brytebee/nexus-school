/**
 * table-pdf-generator.js
 * In-memory branded PDF table generator for Nexus School OS using pdfkit.
 * Supports auto-pagination, repeating table headers, school branding, summary blocks,
 * and page numbering.
 */
"use strict";

const PDFDocument = require('pdfkit');

/**
 * Format a number as Nigerian Naira currency string
 * @param {number|string} val 
 * @returns {string}
 */
function formatCurrency(val) {
  const num = Number(val || 0);
  return num.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Generates an in-memory PDF buffer for a tabular report.
 * @param {Object} options
 * @param {string} [options.title] - Report title (e.g. "STUDENT FEE ROSTER")
 * @param {string} [options.subtitle] - Filter context or subtitle (e.g. "Session: 2024/2025 | Term: First Term")
 * @param {Array<{ key: string, header: string, width?: number, align?: 'left'|'center'|'right', format?: 'currency'|'date'|'text' }>} options.columns
 * @param {Array<Object>} options.rows - Data rows
 * @param {'landscape'|'portrait'} [options.orientation='landscape']
 * @param {Array<{ label: string, value: string|number, format?: 'currency' }>} [options.summaryTotals]
 * @param {string} [options.schoolName]
 * @param {string} [options.schoolAddress]
 * @param {string} [options.schoolPhone]
 * @param {string} [options.schoolLogoB64]
 * @returns {Promise<Buffer>}
 */
function generateTablePdf(options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const orientation = options.orientation === 'portrait' ? 'portrait' : 'landscape';
      const isLandscape = orientation === 'landscape';

      const pageWidth = isLandscape ? 841.89 : 595.28;
      const pageHeight = isLandscape ? 595.28 : 841.89;
      const margin = 35;
      const printableWidth = pageWidth - (margin * 2);

      const doc = new PDFDocument({
        size: 'A4',
        layout: orientation,
        margins: { top: margin, bottom: margin, left: margin, right: margin },
        bufferPages: true,
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      // Calculate column widths proportional to printableWidth
      const columns = (options.columns || []).map(c => ({
        key: c.key,
        header: c.header || c.key,
        widthWeight: Number(c.width) || 100,
        align: c.align || 'left',
        format: c.format || 'text',
      }));

      const totalWeight = columns.reduce((acc, c) => acc + c.widthWeight, 0) || 1;
      let computedCols = columns.map(c => ({
        ...c,
        computedWidth: Math.floor((c.widthWeight / totalWeight) * printableWidth),
      }));

      // Adjust rounding discrepancy to match printableWidth exactly
      const sumWidths = computedCols.reduce((acc, c) => acc + c.computedWidth, 0);
      const diff = printableWidth - sumWidths;
      if (computedCols.length > 0 && diff !== 0) {
        computedCols[computedCols.length - 1].computedWidth += diff;
      }

      // Precalculate X coordinate for each column
      let runningX = margin;
      computedCols = computedCols.map(c => {
        const x = runningX;
        runningX += c.computedWidth;
        return { ...c, x };
      });

      // --- Helper: Draw Top Accent ---
      const drawTopAccent = () => {
        doc.rect(0, 0, pageWidth, 8).fill('#b8860b'); // Dark Goldenrod
      };

      // --- Helper: Draw Header on First Page ---
      let currentY = margin + 10;
      drawTopAccent();

      const schoolName = options.schoolName || 'Nexus School OS';
      const schoolAddress = options.schoolAddress || '';
      const schoolPhone = options.schoolPhone || '';
      const schoolLogoB64 = options.schoolLogoB64 || '';

      const logoSize = 45;
      let textStartX = margin;

      if (schoolLogoB64) {
        try {
          const rawB64 = schoolLogoB64.includes(',') ? schoolLogoB64.split(',')[1] : schoolLogoB64;
          const logoBuffer = Buffer.from(rawB64, 'base64');
          doc.image(logoBuffer, margin, currentY - 2, { width: logoSize, height: logoSize });
          textStartX = margin + logoSize + 12;
        } catch (_) {
          // Fallback if logo corrupt
          textStartX = margin;
        }
      }

      // School info (Left)
      doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text(schoolName, textStartX, currentY);
      let subY = currentY + 16;
      if (schoolAddress || schoolPhone) {
        const contactLine = [schoolAddress, schoolPhone ? `Tel: ${schoolPhone}` : ''].filter(Boolean).join('  •  ');
        doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(contactLine, textStartX, subY, {
          width: printableWidth - (textStartX - margin) - 180,
          lineBreak: false,
          ellipsis: true,
        });
        subY += 12;
      }

      // Generated timestamp (Right)
      const nowStr = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }) + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

      doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text(`Exported: ${nowStr}`, margin, currentY, {
        width: printableWidth,
        align: 'right',
      });
      doc.text(`Total Records: ${(options.rows || []).length}`, margin, currentY + 11, {
        width: printableWidth,
        align: 'right',
      });

      // Title Banner
      currentY = Math.max(subY + 8, currentY + logoSize + 4);
      doc.rect(margin, currentY, printableWidth, 24).fill('#0f172a');

      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
         .text(options.title || 'REPORT', margin + 10, currentY + 7);

      if (options.subtitle) {
        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
           .text(options.subtitle, margin, currentY + 8, { width: printableWidth - 10, align: 'right' });
      }

      currentY += 28;

      // --- Helper: Draw Table Header Row ---
      const tableHeaderHeight = 20;
      const drawTableHeader = (y) => {
        doc.rect(margin, y, printableWidth, tableHeaderHeight).fill('#1e293b');
        computedCols.forEach(col => {
          doc.fillColor('#f8fafc').fontSize(7.5).font('Helvetica-Bold')
             .text(col.header, col.x + 4, y + 6, {
               width: col.computedWidth - 8,
               align: col.align,
               lineBreak: false,
               ellipsis: true,
             });
        });
      };

      drawTableHeader(currentY);
      currentY += tableHeaderHeight;

      // --- Render Rows ---
      const rowHeight = 18;
      const rows = options.rows || [];
      const bottomLimit = pageHeight - margin - 30;

      rows.forEach((row, rowIndex) => {
        // Page break check
        if (currentY + rowHeight > bottomLimit) {
          doc.addPage();
          drawTopAccent();
          currentY = margin + 10;

          // Mini header on subsequent pages
          doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold')
             .text(`${options.title || 'REPORT'} (Continued)`, margin, currentY);
          currentY += 14;

          drawTableHeader(currentY);
          currentY += tableHeaderHeight;
        }

        // Alternating row background
        if (rowIndex % 2 === 1) {
          doc.rect(margin, currentY, printableWidth, rowHeight).fill('#f8fafc');
        }

        // Row cells
        computedCols.forEach(col => {
          let val = row[col.key];
          if (val === undefined || val === null) val = '—';

          let displayVal = String(val);
          if (col.format === 'currency') {
            displayVal = formatCurrency(val);
          }

          // Special status color hint
          if (col.key === 'status') {
            const st = String(val).toLowerCase();
            if (st === 'cleared') doc.fillColor('#16a34a'); // Green
            else if (st === 'partial') doc.fillColor('#d97706'); // Amber
            else if (st === 'unpaid') doc.fillColor('#dc2626'); // Red
            else doc.fillColor('#334155');
          } else {
            doc.fillColor('#1e293b');
          }

          doc.fontSize(7.5).font(col.key === 'status' ? 'Helvetica-Bold' : 'Helvetica')
             .text(displayVal, col.x + 4, currentY + 5, {
               width: col.computedWidth - 8,
               align: col.align,
               lineBreak: false,
               ellipsis: true,
             });
        });

        // Bottom border line for row
        doc.moveTo(margin, currentY + rowHeight)
           .lineTo(margin + printableWidth, currentY + rowHeight)
           .strokeColor('#f1f5f9')
           .lineWidth(0.5)
           .stroke();

        currentY += rowHeight;
      });

      // --- Summary Totals Block ---
      if (Array.isArray(options.summaryTotals) && options.summaryTotals.length > 0) {
        const summaryHeight = 32;
        if (currentY + summaryHeight + 10 > bottomLimit) {
          doc.addPage();
          drawTopAccent();
          currentY = margin + 10;
        } else {
          currentY += 8;
        }

        const summaryBoxWidth = Math.min(printableWidth, 420);
        const summaryBoxX = margin + printableWidth - summaryBoxWidth;

        doc.rect(summaryBoxX, currentY, summaryBoxWidth, summaryHeight).fill('#0f172a');

        const colW = summaryBoxWidth / options.summaryTotals.length;
        options.summaryTotals.forEach((item, idx) => {
          const itemX = summaryBoxX + (idx * colW);
          const valFormatted = item.format === 'currency' ? `NGN ${formatCurrency(item.value)}` : String(item.value);

          doc.fillColor('#94a3b8').fontSize(7).font('Helvetica-Bold')
             .text((item.label || '').toUpperCase(), itemX + 6, currentY + 6, {
               width: colW - 12,
               align: 'center',
             });
          doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
             .text(valFormatted, itemX + 6, currentY + 17, {
               width: colW - 12,
               align: 'center',
             });
        });

        currentY += summaryHeight;
      }

      // --- Running Page Numbers & Watermark on all buffered pages ---
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0; // Prevent PDFKit auto-pagination when drawing in margin

        const footerY = pageHeight - margin + 8;

        // Thin top footer line
        doc.moveTo(margin, footerY - 4)
           .lineTo(margin + printableWidth, footerY - 4)
           .strokeColor('#e2e8f0')
           .lineWidth(0.5)
           .stroke();

        // Left: Watermark
        doc.fillColor('#94a3b8').fontSize(7).font('Helvetica')
           .text('Nexus School OS  •  Official Administrative Document', margin, footerY, {
             lineBreak: false,
           });

        // Right: Page numbers
        doc.text(`Page ${i + 1} of ${pages.count}`, margin, footerY, {
          width: printableWidth,
          align: 'right',
          lineBreak: false,
        });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateTablePdf,
};
