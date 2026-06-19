import { type ComponentType, type CSSProperties } from 'react';
import type { LucideProps } from 'lucide-react';
import { GitBranchPlus, GitMergeConflict } from 'lucide-react';
import type { Ticket } from '../../../context/TicketContextContext';

interface TicketRelationIndicatorsProps {
  ticket: Pick<Ticket, 'isBlocked' | 'isDependency'>;
  size?: 'sm' | 'md';
  style?: CSSProperties;
}

const CHIP_SIZES = {
  sm: { iconSize: 14 },
  md: { iconSize: 16 },
} as const;

const CHIP_STYLES = {
  blocked: {
    color: 'var(--color-text-error)',
    title: 'Blocked',
    icon: GitMergeConflict,
  },
  dependency: {
    color: 'var(--color-accent)',
    title: 'Blocking',
    icon: GitBranchPlus,
  },
} as const;

function RelationChip({
  title,
  icon: Icon,
  color,
  iconSize,
}: {
  title: string;
  icon: ComponentType<LucideProps>;
  color: string;
  iconSize: number;
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
        color,
        flexShrink: 0,
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
          color={CHIP_STYLES.blocked.color}
          iconSize={chipSize.iconSize}
        />
      ) : null}
      {ticket.isDependency ? (
        <RelationChip
          title={CHIP_STYLES.dependency.title}
          icon={CHIP_STYLES.dependency.icon}
          color={CHIP_STYLES.dependency.color}
          iconSize={chipSize.iconSize}
        />
      ) : null}
    </span>
  );
}
