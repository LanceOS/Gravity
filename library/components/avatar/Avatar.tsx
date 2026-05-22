import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface AvatarProps {
  src?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
}

export function Avatar({ src, name, size = 'md', style }: AvatarProps) {
  const sizePx = { sm: '24px', md: '36px', lg: '48px' }[size];
  const fontSize = { sm: '10px', md: '13px', lg: '16px' }[size];

  const getInitials = () => {
    if (!name) return '';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <div
      style={{
        width: sizePx,
        height: sizePx,
        borderRadius: 'var(--radius-full)',
        border: '1px solid var(--border)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--sidebar-bg)',
        overflow: 'hidden',
        color: 'var(--text-heading)',
        fontWeight: 500,
        fontSize,
        flexShrink: 0,
        ...style,
      }}
    >
      {src ? (
        <img src={src} alt={name || 'Avatar'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : name ? (
        getInitials()
      ) : (
        <User size={16} />
      )}
    </div>
  );
}
