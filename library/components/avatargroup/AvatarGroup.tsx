import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface AvatarGroupProps {
  children: React.ReactNode;
  max?: number;
  style?: React.CSSProperties;
}

export function AvatarGroup({ children, max = 4, style }: AvatarGroupProps) {
  const avatars = React.Children.toArray(children);
  const visibleAvatars = avatars.slice(0, max);
  const extraCount = avatars.length - max;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', ...style }}>
      {visibleAvatars.map((av, idx) => (
        <div key={idx} style={{ marginLeft: idx > 0 ? '-8px' : '0px', zIndex: 10 - idx }}>
          {av}
        </div>
      ))}
      {extraCount > 0 && (
        <div
          style={{
            marginLeft: '-8px',
            zIndex: 0,
            width: '28px',
            height: '28px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--sidebar-bg)',
            border: '1px solid var(--border)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            fontWeight: 600,
            color: 'var(--text-muted)',
          }}
        >
          +{extraCount}
        </div>
      )}
    </div>
  );
}
