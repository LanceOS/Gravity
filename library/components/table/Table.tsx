import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface TableProps<T> {
  columns: ColumnConfig<T>[];
  data: T[];
  style?: React.CSSProperties;
}

export function Table<T>({ columns, data, style }: TableProps<T>) {
  return (
    <div className="scroll-container" style={{ width: '100%', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', ...style }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--sidebar-bg)' }}>
            {columns.map((col, idx) => (
              <th key={idx} style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text-muted)', width: col.width }}>
                {col.title || col.header || String(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rIdx) => (
            <tr key={rIdx} style={{ borderBottom: rIdx < data.length - 1 ? '1px solid var(--border)' : 'none' }}>
              {columns.map((col, cIdx) => (
                <td key={cIdx} style={{ padding: '10px 12px', color: 'var(--text-heading)' }}>
                  {col.render ? col.render(row) : (row[col.key as keyof T] as any)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
