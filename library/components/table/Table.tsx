import React from 'react';
import { type ColumnConfig } from '../datagrid';
import { getCellValue, renderCellValue } from '../datagrid/renderCellValue';

export interface TableProps<T> {
  columns: ColumnConfig<T>[];
  data: T[];
  style?: React.CSSProperties;
}

export function Table<T>({ columns, data, style }: TableProps<T>) {
  return (
    <div className="scroll-container" style={{ width: '100%', overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--surface-glass-strong)', ...style }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--color-base50)' }}>
            {columns.map((col, idx) => (
              <th key={idx} style={{ padding: '13px 16px', fontWeight: 500, color: 'var(--color-text-secondary)', width: col.width }}>
                {col.title || col.header || String(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rIdx) => (
            <tr key={rIdx} style={{ borderBottom: rIdx < data.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              {columns.map((col, cIdx) => (
                <td key={cIdx} style={{ padding: '13px 16px', color: 'var(--color-text-primary)' }}>
                  {col.render ? col.render(row) : renderCellValue(getCellValue(row, col.key))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
