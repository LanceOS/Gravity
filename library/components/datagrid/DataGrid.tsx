import React from 'react';
import { getCellValue, renderCellValue } from './renderCellValue';

export interface ColumnConfig<T> {
  /** Unique column identity; keep it stable when reordering or changing labels. */
  key: keyof T | string;
  title?: string;
  header?: string;
  width?: number | string;
  render?: (item: T) => React.ReactNode;
}

export interface DataGridProps<T> {
  columns: ColumnConfig<T>[];
  data: T[];
  /** Unique, stable identity for each row, including across immutable updates. */
  getRowKey: (row: T) => React.Key;
  rowHeight?: number;
  height?: number;
  style?: React.CSSProperties;
}

export function DataGrid<T>({ columns, data, getRowKey, rowHeight = 36, height = 360, style }: DataGridProps<T>) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const buffer = 5;

  // Track viewport bounds independently of data length so insertions do not
  // temporarily omit (and unmount) rows before an effect updates the range.
  const [scrollRange, setScrollRange] = React.useState({
    start: 0,
    end: Math.ceil(height / rowHeight) + buffer
  });

  // Re-read scrollTop on length changes because the browser may clamp it
  // when the scrollable content shrinks.
  React.useEffect(() => {
    const visibleCount = Math.ceil(height / rowHeight);
    if (containerRef.current) {
      const scrollTop = containerRef.current.scrollTop;
      const start = Math.floor(scrollTop / rowHeight);
      const boundedStart = Math.max(0, start - buffer);
      const boundedEnd = start + visibleCount + buffer;
      setScrollRange({ start: boundedStart, end: boundedEnd });
    } else {
      setScrollRange({ start: 0, end: visibleCount + buffer });
    }
  }, [data.length, height, rowHeight, buffer]);

  const totalHeight = data.length * rowHeight;

  const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const start = Math.floor(scrollTop / rowHeight);
    const visibleCount = Math.ceil(height / rowHeight);
    
    const boundedStart = Math.max(0, start - buffer);
    const boundedEnd = start + visibleCount + buffer;
    
    setScrollRange(prev => {
      if (prev.start !== boundedStart || prev.end !== boundedEnd) {
        return { start: boundedStart, end: boundedEnd };
      }
      return prev;
    });
  }, [height, rowHeight, buffer]);

  const visibleRows = React.useMemo(() => {
    const rows = [];
    for (let i = scrollRange.start; i <= Math.min(scrollRange.end, data.length - 1); i++) {
      if (data[i]) {
        rows.push({ index: i, item: data[i] });
      }
    }
    return rows;
  }, [data, scrollRange]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="scroll-container"
      style={{
        position: 'relative',
        overflow: 'auto',
        height: `${height}px`,
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: 'var(--color-surface-card)',
        width: '100%',
        ...style,
      }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          backgroundColor: 'var(--color-base50)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          height: `${rowHeight}px`,
          alignItems: 'center',
          fontWeight: 500,
          fontSize: '13px',
          color: 'var(--color-text-secondary)',
        }}
      >
        {columns.map((col) => (
          <div key={String(col.key)} style={{ flex: 1, padding: '0 16px', width: col.width, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {col.title || col.header || String(col.key)}
          </div>
        ))}
      </div>

      <div style={{ position: 'relative', height: `${totalHeight + rowHeight}px`, width: '100%' }}>
        {visibleRows.map((row) => (
          <div
            key={getRowKey(row.item)}
            style={{
              position: 'absolute',
              top: `${row.index * rowHeight + rowHeight}px`,
              left: 0,
              right: 0,
              height: `${rowHeight}px`,
              display: 'flex',
              alignItems: 'center',
              borderBottom: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--color-surface-card)',
              fontSize: '13px',
            }}
          >
            {columns.map((col) => (
              <div key={String(col.key)} style={{ flex: 1, padding: '0 16px', width: col.width, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-primary)' }}>
                {col.render ? col.render(row.item) : renderCellValue(getCellValue(row.item, col.key))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
