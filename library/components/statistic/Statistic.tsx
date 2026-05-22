import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface StatisticProps {
  title: string;
  value: string | number;
  suffix?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Statistic({ title, value, suffix, style }: StatisticProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...style }}>
      <div className="label">{title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-heading)' }}>{value}</span>
        {suffix && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{suffix}</span>}
      </div>
    </div>
  );
}
