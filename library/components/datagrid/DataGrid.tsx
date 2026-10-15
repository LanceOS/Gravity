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
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const buffer = 5;
  const layoutRef = React.useRef({ headerHeight: 0, viewportHeight: height, rowCount: data.length, maxScrollTop: 0 });

  // Keep the range independent of data length so insertions do not briefly
  // unmount rows that remain in the viewport.
  const [scrollRange, setScrollRange] = React.useState({
    start: 0,
    end: Math.ceil(height / rowHeight) + buffer
  });

  const totalHeight = data.length * rowHeight;

  const updateScrollRange = React.useCallback(() => {
    const viewport = containerRef.current;
    if (!viewport) return;

    const { headerHeight, viewportHeight, maxScrollTop } = layoutRef.current;
    const scrollTop = Math.min(Math.max(0, viewport.scrollTop), maxScrollTop);
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
  }, [rowHeight, buffer]);

  const refreshScrollBounds = React.useCallback(() => {
    const viewport = containerRef.current;
    if (!viewport) return;

    // scrollHeight includes the header and any CSS border or padding applied
    // to the canvas. jsdom has no layout, so tests use the fixed row pitch.
    const contentHeight = viewport.scrollHeight || layoutRef.current.headerHeight + layoutRef.current.rowCount * rowHeight;
    layoutRef.current.maxScrollTop = Math.max(0, contentHeight - layoutRef.current.viewportHeight);
  }, [rowHeight]);

  const measureLayout = React.useCallback(() => {
    const viewport = containerRef.current;
    const header = headerRef.current;
    if (!viewport || !header) return;

    layoutRef.current.headerHeight = header.getBoundingClientRect().height;
    layoutRef.current.viewportHeight = viewport.clientHeight || height;
    refreshScrollBounds();
    updateScrollRange();
  }, [height, refreshScrollBounds, updateScrollRange]);

  // Recalculate after content changes, even if the browser has not delivered
  // the scroll event caused by clamping a now-shorter body.
  React.useLayoutEffect(() => {
    layoutRef.current.rowCount = data.length;
    refreshScrollBounds();
    updateScrollRange();
  }, [data.length, refreshScrollBounds, updateScrollRange]);

  // Measurements change with theme, responsive layout, and zoom. Keep the
  // observer independent of data and column identities; scrolling uses the
  // cached dimensions instead of forcing a fresh layout measurement.
  React.useLayoutEffect(() => {
    measureLayout();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(measureLayout);
    if (headerRef.current) observer.observe(headerRef.current);
    if (containerRef.current) observer.observe(containerRef.current);
    if (bodyRef.current) observer.observe(bodyRef.current, { box: 'border-box' });
    return () => observer.disconnect();
  }, [measureLayout]);

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

      <div ref={bodyRef} style={{ position: 'relative', height: `${totalHeight}px`, width: '100%' }}>
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
