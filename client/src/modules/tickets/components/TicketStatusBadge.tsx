import React, { memo } from 'react';
import type { CSSProperties } from 'react';
import type { Ticket } from '../../../context/TicketContextContext';
import { getStatusColor, getStatusLabel } from '../utils/TicketDetail';

interface TicketStatusBadgeProps {
  status: Ticket['status'];
  style?: CSSProperties;
  className?: string;
}

const COLOR_RGBA_CACHE = new Map<string, string>();

function colorToRgba(color: string, alpha: number) {
  const cacheKey = `${color}|${alpha}`;
  const cached = COLOR_RGBA_CACHE.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
    return color;
  }

  const normalized = color.slice(1);
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  const red = Number.parseInt(expanded.slice(0, 2), 16) || 0;
  const green = Number.parseInt(expanded.slice(2, 4), 16) || 0;
  const blue = Number.parseInt(expanded.slice(4, 6), 16) || 0;
  const rgba = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  COLOR_RGBA_CACHE.set(cacheKey, rgba);
  return rgba;
}

function TicketStatusBadgeImpl({ status, style, className }: TicketStatusBadgeProps) {
  const color = getStatusColor(status);
  const label = getStatusLabel(status);

  return (
    <span
      className={className}
      aria-label={`Status: ${label}`}
      title={`Status: ${label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        width: '8px',
        height: '8px',
        borderRadius: '999px',
        border: `1px solid ${colorToRgba(color, 0.28)}`,
        backgroundColor: color,
        boxShadow: `0 0 0 2px ${colorToRgba(color, 0.12)}`,
        userSelect: 'none',
        ...style,
      }}
    />
  );
}

export const TicketStatusBadge = memo(TicketStatusBadgeImpl, (previousProps, nextProps) =>
  previousProps.status === nextProps.status &&
  previousProps.style === nextProps.style &&
  previousProps.className === nextProps.className
);
