import React from 'react';

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
