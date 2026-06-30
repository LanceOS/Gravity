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
  
  const [scrollRange, setScrollRange] = React.useState({
    startIndex: 0,
    endIndex: Math.min(Math.max(0, items.length - 1), Math.ceil(height / rowHeight) + buffer)
  });

  React.useEffect(() => {
    const visibleCount = Math.ceil(height / rowHeight);
    if (containerRef.current) {
      const scrollTop = containerRef.current.scrollTop;
      const start = Math.floor(scrollTop / rowHeight);
      const boundedStart = Math.max(0, start - buffer);
      const boundedEnd = Math.min(Math.max(0, items.length - 1), start + visibleCount + buffer);
      setScrollRange({ startIndex: boundedStart, endIndex: boundedEnd });
    } else {
      setScrollRange({ startIndex: 0, endIndex: Math.min(Math.max(0, items.length - 1), visibleCount + buffer) });
    }
  }, [items.length, height, rowHeight, buffer]);

  const onScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const start = Math.floor(scrollTop / rowHeight);
    const visibleCount = Math.ceil(height / rowHeight);
    
    const boundedStart = Math.max(0, start - buffer);
    const boundedEnd = Math.min(Math.max(0, items.length - 1), start + visibleCount + buffer);
    
    setScrollRange(prev => {
      if (prev.startIndex !== boundedStart || prev.endIndex !== boundedEnd) {
        return { startIndex: boundedStart, endIndex: boundedEnd };
      }
      return prev;
    });
  }, [height, rowHeight, buffer, items.length]);

  const totalHeight = items.length * rowHeight;
  const { startIndex, endIndex } = scrollRange;

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
