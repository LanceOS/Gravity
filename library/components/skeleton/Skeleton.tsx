import React from 'react';

export interface SkeletonProps {
  variant?: 'circle' | 'text' | 'rect';
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
}

export function Skeleton({ variant = 'rect', width = '100%', height = '16px', style }: SkeletonProps) {
  const radiusMap = {
    circle: '50%',
    text: 'var(--radius-xs)',
    rect: 'var(--radius-md)',
  };

  return (
    <div
      className="lib-skeleton-pulse"
      aria-busy="true"
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: radiusMap[variant],
        backgroundColor: 'var(--color-border-default)',
        ...style,
      }}
    />
  );
}
