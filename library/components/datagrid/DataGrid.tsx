import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface DataGridProps<T> {
  columns: ColumnConfig<T>[];
  data: T[];
  rowHeight?: number;
  height?: number;
  style?: React.CSSProperties;
}

export function DataGrid<T>({ columns, data, rowHeight = 36, height = 360, style }: DataGridProps<T>) {
  const [scrollTop, setScrollTop] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const totalHeight = data.length * rowHeight;
  const startIndex = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.ceil(height / rowHeight);
  const buffer = 5;
  const bufferedStartIndex = Math.max(0, startIndex - buffer);
  const bufferedEndIndex = Math.min(data.length - 1, startIndex + visibleCount + buffer);

  const visibleRows = React.useMemo(() => {
    const rows = [];
    for (let i = bufferedStartIndex; i <= bufferedEndIndex; i++) {
      if (data[i]) {
        rows.push({ index: i, item: data[i] });
      }
    }
    return rows;
  }, [data, bufferedStartIndex, bufferedEndIndex]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

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
      {/* Header Sticky */}
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

      {/* Grid Scrollable Canvas */}
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
                {col.render ? col.render(row.item) : (row.item[col.key as keyof T] as any)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
