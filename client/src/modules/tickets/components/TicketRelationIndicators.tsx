import { type ComponentType, type CSSProperties } from 'react';
import type { LucideProps } from 'lucide-react';
import { Ban, Link2 } from 'lucide-react';
import type { Ticket } from '../../../context/TicketContext';

interface TicketRelationIndicatorsProps {
  ticket: Pick<Ticket, 'isBlocked' | 'isDependency'>;
  size?: 'sm' | 'md';
  style?: CSSProperties;
}

const CHIP_SIZES = {
  sm: { size: 16, iconSize: 10 },
  md: { size: 18, iconSize: 11 },
} as const;

const CHIP_STYLES = {
  blocked: {
    background: 'var(--color-bg-error)',
    borderColor: 'var(--color-border-error)',
    color: 'var(--color-text-error)',
    title: 'Blocked',
    icon: Ban,
  },
  dependency: {
    background: 'var(--color-state-selected-bg)',
    borderColor: 'var(--color-border-focus)',
    color: 'var(--color-accent)',
    title: 'Blocking',
    icon: Link2,
  },
} as const;

function RelationChip({
  title,
  icon: Icon,
  background,
  borderColor,
  color,
  iconSize,
  size,
}: {
  title: string;
  icon: ComponentType<LucideProps>;
  background: string;
  borderColor: string;
  color: string;
  iconSize: number;
  size: number;
}) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '9999px',
        background,
        border: `1px solid ${borderColor}`,
        color,
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      <Icon size={iconSize} aria-hidden="true" focusable="false" />
    </span>
  );
}

export function TicketRelationIndicators({ ticket, size = 'sm', style }: TicketRelationIndicatorsProps) {
  const chipSize = CHIP_SIZES[size];

  if (!ticket.isBlocked && !ticket.isDependency) {
    return null;
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        flexShrink: 0,
        ...style,
      } as CSSProperties}
    >
      {ticket.isBlocked ? (
        <RelationChip
          title={CHIP_STYLES.blocked.title}
          icon={CHIP_STYLES.blocked.icon}
          background={CHIP_STYLES.blocked.background}
          borderColor={CHIP_STYLES.blocked.borderColor}
          color={CHIP_STYLES.blocked.color}
          iconSize={chipSize.iconSize}
          size={chipSize.size}
        />
      ) : null}
      {ticket.isDependency ? (
        <RelationChip
          title={CHIP_STYLES.dependency.title}
          icon={CHIP_STYLES.dependency.icon}
          background={CHIP_STYLES.dependency.background}
          borderColor={CHIP_STYLES.dependency.borderColor}
          color={CHIP_STYLES.dependency.color}
          iconSize={chipSize.iconSize}
          size={chipSize.size}
        />
      ) : null}
    </span>
  );
}
