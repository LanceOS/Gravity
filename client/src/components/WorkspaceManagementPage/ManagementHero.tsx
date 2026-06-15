import type { ComponentType } from 'react';

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
    <section className={`${classNamePrefix}__hero`}>
      <div>
        <div className={`${classNamePrefix}__eyebrow`}>{eyebrow}</div>
        <div className={`${classNamePrefix}__hero-header`}>
          <h2>{title}</h2>
          <div className={`${classNamePrefix}__hero-meta`}>
            {metaItems.map((item, index) => (
              <span key={`${classNamePrefix}__hero-pill-${index}`} className={`${classNamePrefix}__hero-pill`}>
                {item}
              </span>
            ))}
          </div>
        </div>
        <p className={`${classNamePrefix}__hero-description`}>{description}</p>
      </div>

      <div className={`${classNamePrefix}__hero-stat`}>
        <StatIcon size={18} />
        <span>{statValue}</span>
        <small>{statValue === 1 ? statSingularLabel : statPluralLabel}</small>
      </div>
    </section>
  );
}
