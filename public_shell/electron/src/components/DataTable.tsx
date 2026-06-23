import React, { ReactNode } from 'react';

export interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (row: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({ data, columns, isLoading, emptyMessage = "No data available", onRowClick }: DataTableProps<T>) {
  if (isLoading && data.length === 0) {
    return (
      <div className="w-full h-48 flex items-center justify-center text-nexus-text-dim border border-nexus-border rounded-xl bg-nexus-panel/50">
        <span className="animate-pulse">Loading data...</span>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto border border-nexus-border rounded-xl bg-nexus-panel shadow-sm relative">
      {isLoading && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(10, 14, 46, 0.45)', backdropFilter: 'blur(1.5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10, borderRadius: '12px'
        }}>
          <span className="animate-pulse" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '13px', letterSpacing: '0.5px' }}>Refreshing Shard Registry...</span>
        </div>
      )}
      <table className="w-full text-left text-sm text-nexus-text border-collapse">
        <thead className="bg-black/20 text-nexus-text-dim border-b border-nexus-border uppercase tracking-wider text-[11px] font-semibold">
          <tr>
            {columns.map((col, idx) => (
              <th 
                key={idx} 
                className={`py-4 px-6 whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-nexus-border">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-12 px-6 text-center text-nexus-text-dim">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => (
              <tr 
                key={rowIdx} 
                className={`hover:bg-white/5 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col, colIdx) => (
                  <td 
                    key={colIdx} 
                    className={`py-3 px-6 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                  >
                    {col.cell ? col.cell(row) : (col.accessorKey ? String(row[col.accessorKey]) : null)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
