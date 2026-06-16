import type { ComponentType } from 'react';
import { ManagementSurface } from '../ManagementSurface';

export interface WorkspaceManagementHeroProps {
  classNamePrefix: string;
  eyebrow: string;
  title: string;
  metaItems: string[];
  description: string;
  StatIcon: ComponentType<{ size: number }>;
  statValue: number;
  statSingularLabel: string;
  statPluralLabel: string;
}

export function WorkspaceManagementHero({
  classNamePrefix,
  eyebrow,
  title,
  metaItems,
  description,
  StatIcon,
  statValue,
  statSingularLabel,
  statPluralLabel,
}: WorkspaceManagementHeroProps) {
  return (
    <ManagementSurface.Hero
      classNamePrefix={classNamePrefix}
      eyebrow={eyebrow}
      title={title}
      metaItems={metaItems}
      description={description}
      StatIcon={StatIcon}
      statValue={statValue}
      statSingularLabel={statSingularLabel}
      statPluralLabel={statPluralLabel}
    />
  );
}
