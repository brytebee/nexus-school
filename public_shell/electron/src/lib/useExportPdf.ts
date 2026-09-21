/**
 * useExportPdf.ts
 * Global reusable hook for generating and downloading branded table PDF reports.
 * Uses the export:table-pdf IPC handler via window.electronAPI.export.tablePdf.
 *
 * Usage in any view:
 *   const { exportTablePdf, exporting } = useExportPdf();
 *   await exportTablePdf({ title, subtitle, columns, rows, summaryTotals, filename });
 */

import { useState } from 'react';

export interface ExportColumn {
  /** Key into each row object */
  key: string;
  /** Column header label */
  header: string;
  /** Proportional width weight (e.g. 100, 160, 80) */
  width?: number;
  /** Text alignment within the column */
  align?: 'left' | 'center' | 'right';
  /** Value format: 'currency' formats as ₦ number, 'text' (default) is plain */
  format?: 'currency' | 'text';
}

export interface ExportSummaryItem {
  label: string;
  value: string | number;
  /** 'currency' prefix value with ₦ */
  format?: 'currency';
}

export interface ExportTablePdfParams {
  /** Report title rendered in the dark banner */
  title: string;
  /** Subtitle / filter context rendered right-aligned in the banner */
  subtitle?: string;
  /** Column schema */
  columns: ExportColumn[];
  /** Row data — each row is a plain object keyed by column.key values */
  rows: Record<string, unknown>[];
  /** Optional summary totals block rendered below the table */
  summaryTotals?: ExportSummaryItem[];
  /** Page orientation — defaults to 'landscape' (better for wide tables) */
  orientation?: 'landscape' | 'portrait';
  /** Filename for the downloaded file (without extension) */
  filename?: string;
}

interface UseExportPdfReturn {
  exportTablePdf: (params: ExportTablePdfParams) => Promise<void>;
  exporting: boolean;
}

export function useExportPdf(): UseExportPdfReturn {
  const [exporting, setExporting] = useState(false);

  const exportTablePdf = async (params: ExportTablePdfParams): Promise<void> => {
    const api = (window as any).electronAPI;
    if (!api?.export?.tablePdf) {
      throw new Error('PDF export is not available in this environment.');
    }

    setExporting(true);
    try {
      const res = await api.export.tablePdf({
        title:         params.title,
        subtitle:      params.subtitle,
        columns:       params.columns,
        rows:          params.rows,
        summaryTotals: params.summaryTotals,
        orientation:   params.orientation ?? 'landscape',
      });

      if (!res?.ok || !res.pdfBase64) {
        throw new Error(res?.error || 'PDF generation failed — no data returned.');
      }

      // Decode base64 → Uint8Array → Blob → download
      const byteCharacters = atob(res.pdfBase64);
      const byteNumbers = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([byteNumbers], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${(params.filename || params.title).replace(/[^a-z0-9_\-]/gi, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return { exportTablePdf, exporting };
}
