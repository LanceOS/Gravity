import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface DenseVirtualListProps<T> {
  items: T[];
  height: number;
  rowHeight: number;
  buffer?: number;
  renderRow: (item: T, index: number, style: React.CSSProperties) => React.ReactNode;
}

export function DenseVirtualList<T>({
  items,
  height,
  rowHeight,
  buffer = 5,
  renderRow
}: DenseVirtualListProps<T>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);

  const onScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const totalHeight = items.length * rowHeight;
  
  const { startIndex, endIndex } = React.useMemo(() => {
    const visibleCount = Math.ceil(height / rowHeight);
    const start = Math.floor(scrollTop / rowHeight);
    
    const boundedStart = Math.max(0, start - buffer);
    const boundedEnd = Math.min(items.length - 1, start + visibleCount + buffer);
    
    return { startIndex: boundedStart, endIndex: boundedEnd };
  }, [scrollTop, items.length, height, rowHeight, buffer]);

  const visibleItems = React.useMemo(() => {
    const renderedRange: React.ReactNode[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const item = items[i];
      if (!item) continue;

      const style: React.CSSProperties = {
        position: 'absolute',
        top: 0,
        transform: `translate3d(0, ${i * rowHeight}px, 0)`,
        left: 0,
        right: 0,
        height: `${rowHeight}px`,
        willChange: 'transform'
      };

      renderedRange.push(renderRow(item, i, style));
    }
    return renderedRange;
  }, [startIndex, endIndex, items, rowHeight, renderRow]);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      style={{
        height: `${height}px`,
        overflowY: 'auto',
        overflowX: 'hidden',
        position: 'relative',
        outline: 'none',
        backgroundColor: 'transparent',
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-sm)'
      }}
      role="grid"
      aria-rowcount={items.length}
    >
      <div
        style={{
          height: `${totalHeight}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {visibleItems}
      </div>
    </div>
  );
}
