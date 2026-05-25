import React from 'react';

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
          backgroundColor: 'var(--color-border-default)',
          transition: 'background-color var(--transition-fast)',
        }}
      />
      <div style={{ flexGrow: 1, overflow: 'auto' }}>
        {right}
      </div>
    </div>
  );
}
