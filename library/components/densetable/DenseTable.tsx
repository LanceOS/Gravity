import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface DenseColumnDefinition<T> {
  key: string;
  header: string;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  render: (row: T) => React.ReactNode;
}

export interface DenseTableProps<T> {
  columns: DenseColumnDefinition<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  selectedRowId?: string;
  getRowId: (row: T) => string;
}

export function DenseTable<T>({
  columns,
  data,
  onRowClick,
  selectedRowId,
  getRowId
}: DenseTableProps<T>) {
  const tableRef = React.useRef<HTMLTableElement>(null);

  // Enable keyboard-driven table navigation
  React.useEffect(() => {
    const table = tableRef.current;
    if (!table) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement;
      if (!active || active.getAttribute('role') !== 'row') return;

      const rows = Array.from(table.querySelectorAll('tbody tr[role="row"]')) as HTMLElement[];
      const currentIndex = rows.indexOf(active);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = rows[currentIndex + 1];
        if (next) next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = rows[currentIndex - 1];
        if (prev) prev.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        active.click();
      }
    };

    table.addEventListener('keydown', handleKeyDown);
    return () => table.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div 
      style={{
        overflowX: 'auto',
        width: '100%',
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--color-surface-card)'
      }}
    >
      <table
        ref={tableRef}
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          borderSpacing: 0,
          textAlign: 'left',
          fontFamily: 'var(--mono)',
          fontSize: '11px'
        }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: 'var(--color-base50)',
              borderBottom: '1px solid var(--color-border-default)',
              height: 'var(--table-row-height, 26px)'
            }}
          >
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '2px var(--space-2, 8px)',
                  fontWeight: 600,
                  color: 'var(--color-text-disabled)',
                  width: col.width,
                  textAlign: col.align || 'left',
                  textTransform: 'uppercase',
                  fontSize: '10px',
                  letterSpacing: '0.05em',
                  userSelect: 'none'
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const rowId = getRowId(row);
            const isSelected = selectedRowId === rowId;
            return (
              <tr
                key={rowId}
                role="row"
                tabIndex={0}
                onClick={() => onRowClick?.(row)}
                style={{
                  borderBottom: '1px solid var(--color-border-default)',
                  height: 'var(--table-row-height, 26px)',
                  cursor: onRowClick ? 'pointer' : 'default',
                  backgroundColor: isSelected ? 'var(--color-state-selected-bg)' : 'transparent',
                  outline: 'none',
                  transition: 'background-color var(--transition-fast, 0.1s ease)'
                }}
                className="dense-table-row"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: '0 var(--space-2, 8px)',
                      textAlign: col.align || 'left',
                      color: isSelected 
                        ? 'var(--color-text-primary)' 
                        : 'var(--color-text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
