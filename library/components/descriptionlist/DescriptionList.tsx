import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface DescriptionListProps {
  items: DescriptionItem[];
  style?: React.CSSProperties;
}

export function DescriptionList({ items, style }: DescriptionListProps) {
  return (
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: 'max-content 1fr',
        gap: '8px 16px',
        margin: 0,
        fontSize: '13px',
        ...style,
      }}
    >
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          <dt style={{ color: 'var(--color-text-disabled)', fontWeight: 500 }}>{item.key}</dt>
          <dd style={{ margin: 0, color: 'var(--color-text-primary)' }}>{item.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
