import React from 'react';

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
