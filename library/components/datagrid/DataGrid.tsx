import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';
import { getCellValue, renderCellValue } from './renderCellValue';

export interface ColumnConfig<T> {
  key: keyof T | string;
  title?: string;
  header?: string;
  width?: number | string;
  render?: (item: T) => React.ReactNode;
}

export interface DataGridProps<T> {
  columns: ColumnConfig<T>[];
  data: T[];
  rowHeight?: number;
  height?: number;
  style?: React.CSSProperties;
}

export function DataGrid<T>({ columns, data, rowHeight = 36, height = 360, style }: DataGridProps<T>) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const buffer = 5;

  const [scrollRange, setScrollRange] = React.useState({
    start: 0,
    end: Math.min(Math.max(0, data.length - 1), Math.ceil(height / rowHeight) + buffer)
  });

  React.useEffect(() => {
    const visibleCount = Math.ceil(height / rowHeight);
    if (containerRef.current) {
      const scrollTop = containerRef.current.scrollTop;
      const start = Math.floor(scrollTop / rowHeight);
      const boundedStart = Math.max(0, start - buffer);
      const boundedEnd = Math.min(Math.max(0, data.length - 1), start + visibleCount + buffer);
      setScrollRange({ start: boundedStart, end: boundedEnd });
    } else {
      setScrollRange({ start: 0, end: Math.min(Math.max(0, data.length - 1), visibleCount + buffer) });
    }
  }, [data.length, height, rowHeight, buffer]);

  const totalHeight = data.length * rowHeight;

  const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const start = Math.floor(scrollTop / rowHeight);
    const visibleCount = Math.ceil(height / rowHeight);
    
    const boundedStart = Math.max(0, start - buffer);
    const boundedEnd = Math.min(Math.max(0, data.length - 1), start + visibleCount + buffer);
    
    setScrollRange(prev => {
      if (prev.start !== boundedStart || prev.end !== boundedEnd) {
        return { start: boundedStart, end: boundedEnd };
      }
      return prev;
    });
  }, [height, rowHeight, buffer, data.length]);

  const visibleRows = React.useMemo(() => {
    const rows = [];
    for (let i = scrollRange.start; i <= scrollRange.end; i++) {
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
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-md)',
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
          borderBottom: '1px solid var(--color-border-default)',
          display: 'flex',
          height: `${rowHeight}px`,
          alignItems: 'center',
          fontWeight: 500,
          fontSize: '13px',
          color: 'var(--color-text-disabled)',
        }}
      >
        {columns.map((col, idx) => (
          <div key={idx} style={{ flex: 1, padding: '0 12px', width: col.width, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {col.title || col.header || String(col.key)}
          </div>
        ))}
      </div>

      <div style={{ position: 'relative', height: `${totalHeight + rowHeight}px`, width: '100%' }}>
        {visibleRows.map((row) => (
          <div
            key={row.index}
            style={{
              position: 'absolute',
              top: `${row.index * rowHeight + rowHeight}px`,
              left: 0,
              right: 0,
              height: `${rowHeight}px`,
              display: 'flex',
              alignItems: 'center',
              borderBottom: '1px solid var(--color-border-default)',
              backgroundColor: 'var(--color-surface-card)',
              fontSize: '13px',
            }}
          >
            {columns.map((col, cIdx) => (
              <div key={cIdx} style={{ flex: 1, padding: '0 12px', width: col.width, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-primary)' }}>
                {col.render ? col.render(row.item) : renderCellValue(getCellValue(row.item, col.key))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
