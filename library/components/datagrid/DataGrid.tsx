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
  /** Fixed pixel pitch for virtual rows; change this prop instead of overriding row height in CSS. */
  rowHeight?: number;
  height?: number;
  style?: React.CSSProperties;
}

export function DataGrid<T>({ columns, data, getRowKey, rowHeight = 36, height = 360, style }: DataGridProps<T>) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const headerRef = React.useRef<HTMLDivElement | null>(null);
  const buffer = 5;

  // Keep the range independent of data length so insertions do not briefly
  // unmount rows that remain in the viewport.
  const [scrollRange, setScrollRange] = React.useState({
    start: 0,
    end: Math.ceil(height / rowHeight) + buffer
  });

  const totalHeight = data.length * rowHeight;

  const updateScrollRange = React.useCallback(() => {
    const viewport = containerRef.current;
    const header = headerRef.current;
    if (!viewport || !header) return;

    const scrollTop = viewport.scrollTop;
    const viewportHeight = viewport.clientHeight || height;
    const headerHeight = header.getBoundingClientRect().height;
    // The sticky header occupies the top of the viewport. The body follows it
    // in normal flow, so its visible rows run from scrollTop to the viewport
    // bottom minus the measured header height.
    const start = Math.floor(scrollTop / rowHeight);
    const boundedStart = Math.max(0, start - buffer);
    const boundedEnd = Math.max(start, Math.ceil((scrollTop + viewportHeight - headerHeight) / rowHeight)) + buffer;

    setScrollRange(prev => {
      if (prev.start !== boundedStart || prev.end !== boundedEnd) {
        return { start: boundedStart, end: boundedEnd };
      }
      return prev;
    });
  }, [height, rowHeight, buffer]);

  // Re-read scrollTop after content changes because the browser may clamp it
  // when the scrollable body shrinks. ResizeObserver also covers theme,
  // responsive layout, and zoom changes without requiring another scroll.
  React.useLayoutEffect(() => {
    updateScrollRange();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(updateScrollRange);
    if (headerRef.current) observer.observe(headerRef.current);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateScrollRange, data.length, columns]);

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
      onScroll={updateScrollRange}
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
        ref={headerRef}
        style={{
          position: 'sticky',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          backgroundColor: 'var(--color-base50)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          minHeight: `${rowHeight}px`,
          boxSizing: 'border-box',
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

      <div style={{ position: 'relative', height: `${totalHeight}px`, width: '100%' }}>
        {visibleRows.map((row) => (
          <div
            key={getRowKey(row.item)}
            style={{
              position: 'absolute',
              top: `${row.index * rowHeight}px`,
              left: 0,
              right: 0,
              height: `${rowHeight}px`,
              boxSizing: 'border-box',
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
