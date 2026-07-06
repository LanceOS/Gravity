import React from 'react';
import { X } from 'lucide-react';
import type { Label } from '../../../context/TicketContextContext';

interface LabelBadgeProps {
  label: Label;
  onRemove?: () => void;
  onClick?: () => void;
  size?: 'sm' | 'md';
  interactive?: boolean;
}

function hexToRgba(hex: string, alpha: number): string {
  // Normalize short hex code (e.g. #3b8 to #33bb88)
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }
  const r = parseInt(c.substring(0, 2), 16) || 107;
  const g = parseInt(c.substring(2, 4), 16) || 114;
  const b = parseInt(c.substring(4, 6), 16) || 128;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function LabelBadge({
  label,
  onRemove,
  onClick,
  size = 'sm',
  interactive = false,
}: LabelBadgeProps) {
  const isSm = size === 'sm';
  const baseBgColor = hexToRgba(label.color, 0.12);
  const hoverBgColor = hexToRgba(label.color, 0.22);
  const borderBgColor = hexToRgba(label.color, 0.3);

  const [bg, setBg] = React.useState(baseBgColor);

  const dot = (
    <span
      style={{
        width: isSm ? '6px' : '8px',
        height: isSm ? '6px' : '8px',
        borderRadius: '50%',
        background: label.color,
        flexShrink: 0,
      }}
    />
  );
  const name = <span>{label.name}</span>;

  return (
    <span
      onMouseEnter={() => interactive && setBg(hoverBgColor)}
      onMouseLeave={() => setBg(baseBgColor)}
      title={label.description || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSm ? '4px' : '6px',
        padding: isSm ? '2px 8px' : '4px 10px',
        borderRadius: '12px',
        background: bg,
        color: label.color,
        border: `1px solid ${borderBgColor}`,
        fontSize: isSm ? '11px' : '12px',
        fontWeight: 550,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        cursor: (interactive || onClick) ? 'pointer' : 'default',
        transition: 'background var(--transition-fast, 150ms) ease',
        userSelect: 'none',
      }}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={label.name}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: isSm ? '4px' : '6px',
            padding: 0,
            margin: 0,
            background: 'none',
            border: 'none',
            color: 'inherit',
            font: 'inherit',
            lineHeight: 'inherit',
            cursor: 'pointer',
          }}
        >
          {dot}
          {name}
        </button>
      ) : (
        <>
          {dot}
          {name}
        </>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'inherit',
            opacity: 0.6,
            transition: 'opacity 150ms ease',
            marginLeft: '2px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
          aria-label={`Remove label ${label.name}`}
        >
          <X size={isSm ? 12 : 14} />
        </button>
      )}
    </span>
  );
}
