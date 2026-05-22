import React from 'react';

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
