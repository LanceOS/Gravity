import React from 'react';

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
