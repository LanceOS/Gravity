import React from 'react';

// Container primitive
export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  fluid?: boolean;
}
export function Container({ children, fluid = false, style, className = '', ...props }: ContainerProps) {
  return (
    <div
      className={`lib-container ${className}`}
      style={{
        width: '100%',
        maxWidth: fluid ? '100%' : '1200px',
        marginRight: 'auto',
        marginLeft: 'auto',
        paddingLeft: 'var(--space-4)',
        paddingRight: 'var(--space-4)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

// Stack primitive
export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  gap?: string;
  horizontal?: boolean;
  align?: string;
  justify?: string;
}
export function Stack({ children, gap = 'var(--space-3)', horizontal = false, align, justify, style, className = '', ...props }: StackProps) {
  return (
    <div
      className={`${horizontal ? 'lib-flex-row' : 'lib-stack'} ${className}`}
      style={{
        display: 'flex',
        flexDirection: horizontal ? 'row' : 'column',
        gap,
        alignItems: align,
        justifyContent: justify,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

// Grid primitive
export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  columns?: string | number;
  gap?: string;
}
export function Grid({ children, columns = 3, gap = 'var(--space-3)', style, className = '', ...props }: GridProps) {
  return (
    <div
      className={`lib-grid ${className}`}
      style={{
        display: 'grid',
        gridTemplateColumns: typeof columns === 'number' ? `repeat(${columns}, minmax(0, 1fr))` : columns,
        gap,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

// Flex primitive
export interface FlexProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  direction?: 'row' | 'row-reverse' | 'column' | 'column-reverse';
  wrap?: 'wrap' | 'nowrap' | 'wrap-reverse';
  justify?: string;
  align?: string;
  gap?: string;
}
export function Flex({ children, direction = 'row', wrap = 'nowrap', justify, align, gap, style, className = '', ...props }: FlexProps) {
  return (
    <div
      className={`${className}`}
      style={{
        display: 'flex',
        flexDirection: direction,
        flexWrap: wrap,
        justifyContent: justify,
        alignItems: align,
        gap,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

// Divider primitive
export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  vertical?: boolean;
}
export function Divider({ vertical = false, style, className = '', ...props }: DividerProps) {
  return (
    <div
      className={vertical ? 'lib-divider-vertical' : 'lib-divider'}
      style={style}
      {...props}
    />
  );
}

// SplitPane Resizer
export interface SplitPaneProps extends React.HTMLAttributes<HTMLDivElement> {
  left: React.ReactNode;
  right: React.ReactNode;
  initialWidth?: number;
}
export function SplitPane({ left, right, initialWidth = 240, style, className = '', ...props }: SplitPaneProps) {
  const [width, setWidth] = React.useState(initialWidth);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setWidth(Math.max(120, Math.min(600, startWidth + deltaX)));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={containerRef}
      className={`lib-split-pane ${className}`}
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        ...style,
      }}
      {...props}
    >
      <div style={{ width: `${width}px`, flexShrink: 0, overflow: 'auto' }}>
        {left}
      </div>
      <div
        className="lib-split-pane-resizer clickable"
        onMouseDown={handleMouseDown}
        style={{
          width: '4px',
          cursor: 'col-resize',
          backgroundColor: 'var(--border)',
          transition: 'background-color var(--transition-fast)',
        }}
      />
      <div style={{ flexGrow: 1, overflow: 'auto' }}>
        {right}
      </div>
    </div>
  );
}

// AspectRatio primitive
export interface AspectRatioProps extends React.HTMLAttributes<HTMLDivElement> {
  ratio?: number;
  children: React.ReactNode;
}
export function AspectRatio({ ratio = 1, children, style, className = '', ...props }: AspectRatioProps) {
  return (
    <div
      className={`lib-aspect-ratio ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        paddingTop: `${(1 / ratio) * 100}%`,
        ...style,
      }}
      {...props}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Masonry Primitive
export interface MasonryProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode[];
  columns?: number;
  gap?: string;
}
export function Masonry({ children, columns = 3, gap = 'var(--space-3)', style, className = '', ...props }: MasonryProps) {
  const columnItems = Array.from({ length: columns }, () => [] as React.ReactNode[]);
  children.forEach((child, index) => {
    columnItems[index % columns].push(child);
  });

  return (
    <div
      className={`lib-masonry ${className}`}
      style={{
        display: 'flex',
        gap,
        width: '100%',
        ...style,
      }}
      {...props}
    >
      {columnItems.map((col, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap,
            flex: 1,
          }}
        >
          {col}
        </div>
      ))}
    </div>
  );
}
