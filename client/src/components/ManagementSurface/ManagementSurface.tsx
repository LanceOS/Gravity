import type { ComponentType, ReactNode } from 'react';

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

interface FeedbackValue {
  type: 'success' | 'error';
  message: string;
}

interface ManagementSurfaceItemRenderProps<T> {
  isSelected: boolean;
  item: T;
  onSelect: () => void;
}

export interface ManagementSurfaceRootProps {
  children: ReactNode;
  className?: string;
}

function ManagementSurfaceRoot({ children, className }: ManagementSurfaceRootProps) {
  return <div className={cn('management-surface', className)}>{children}</div>;
}

export interface ManagementSurfaceHeroProps {
  actions?: ReactNode;
  classNamePrefix: string;
  description: ReactNode;
  eyebrow: ReactNode;
  metaItems: ReactNode[];
  StatIcon: ComponentType<{ size: number }>;
  statPluralLabel: string;
  statSingularLabel: string;
  statValue: number;
  title: ReactNode;
}

function ManagementSurfaceHero({
  actions,
  classNamePrefix,
  description,
  eyebrow,
  metaItems,
  StatIcon,
  statPluralLabel,
  statSingularLabel,
  statValue,
  title,
}: ManagementSurfaceHeroProps) {
  const stat = (
    <div className={`${classNamePrefix}__hero-stat`}>
      <StatIcon size={18} />
      <span>{statValue}</span>
      <small>{statValue === 1 ? statSingularLabel : statPluralLabel}</small>
    </div>
  );

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

      {actions ? (
        <div className={`${classNamePrefix}__hero-side`}>
          {stat}
          {actions}
        </div>
      ) : (
        stat
      )}
    </section>
  );
}

export interface ManagementSurfaceFeedbackProps {
  classNamePrefix: string;
  feedback: FeedbackValue | null;
}

function ManagementSurfaceFeedback({ classNamePrefix, feedback }: ManagementSurfaceFeedbackProps) {
  if (!feedback) {
    return null;
  }

  return (
    <div className={`${classNamePrefix}__feedback ${classNamePrefix}__feedback--${feedback.type}`}>
      {feedback.message}
    </div>
  );
}

export interface ManagementSurfaceLayoutProps {
  children: ReactNode;
  className: string;
}

function ManagementSurfaceLayout({ children, className }: ManagementSurfaceLayoutProps) {
  return <div className={className}>{children}</div>;
}

export interface ManagementSurfaceSectionHeaderProps {
  classNamePrefix: string;
  description: ReactNode;
  kicker: ReactNode;
  title: ReactNode;
}

function ManagementSurfaceSectionHeader({
  classNamePrefix,
  description,
  kicker,
  title,
}: ManagementSurfaceSectionHeaderProps) {
  return (
    <div className={`${classNamePrefix}__section-header`}>
      <div>
        <div className={`${classNamePrefix}__section-kicker`}>{kicker}</div>
        <h3>{title}</h3>
      </div>
      <p>{description}</p>
    </div>
  );
}

export interface ManagementSurfaceEmptyStateProps {
  classNamePrefix: string;
  description: ReactNode;
  title: ReactNode;
}

function ManagementSurfaceEmptyState({
  classNamePrefix,
  description,
  title,
}: ManagementSurfaceEmptyStateProps) {
  return (
    <div className={`${classNamePrefix}__empty`}>
      <div className={`${classNamePrefix}__empty-title`}>{title}</div>
      <p>{description}</p>
    </div>
  );
}

export interface ManagementSurfaceListSectionProps<T extends { id: string }> {
  ariaLabel: string;
  classNamePrefix: string;
  emptyStateDescription: ReactNode;
  emptyStateTitle: ReactNode;
  items: T[];
  listClassName: string;
  onSelectItem: (itemId: string) => void;
  renderItem: (props: ManagementSurfaceItemRenderProps<T>) => ReactNode;
  sectionClassName: string;
  sectionDescription: ReactNode;
  sectionKicker: ReactNode;
  sectionTitle: ReactNode;
  selectedItemId: string;
}

function ManagementSurfaceListSection<T extends { id: string }>({
  ariaLabel,
  classNamePrefix,
  emptyStateDescription,
  emptyStateTitle,
  items,
  listClassName,
  onSelectItem,
  renderItem,
  sectionClassName,
  sectionDescription,
  sectionKicker,
  sectionTitle,
  selectedItemId,
}: ManagementSurfaceListSectionProps<T>) {
  return (
    <section className={sectionClassName} aria-label={ariaLabel}>
      <ManagementSurfaceSectionHeader
        classNamePrefix={classNamePrefix}
        kicker={sectionKicker}
        title={sectionTitle}
        description={sectionDescription}
      />

      {items.length === 0 ? (
        <ManagementSurfaceEmptyState
          classNamePrefix={classNamePrefix}
          title={emptyStateTitle}
          description={emptyStateDescription}
        />
      ) : (
        <div className={listClassName}>
          {items.map((item) => {
            const isSelected = selectedItemId === item.id;

            return (
              <div key={item.id}>
                {renderItem({
                  item,
                  isSelected,
                  onSelect: () => onSelectItem(item.id),
                })}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export interface ManagementSurfaceEditorSectionProps<T> {
  ariaLabel: string;
  children: (item: T) => ReactNode;
  classNamePrefix: string;
  editorClassName: string;
  emptyStateDescription: ReactNode;
  emptyStateTitle: ReactNode;
  getSelectedItemTitle: (item: T) => ReactNode;
  sectionDescription: ReactNode;
  sectionKicker: ReactNode;
  selectedItem: T | null;
}

function ManagementSurfaceEditorSection<T>({
  ariaLabel,
  children,
  classNamePrefix,
  editorClassName,
  emptyStateDescription,
  emptyStateTitle,
  getSelectedItemTitle,
  sectionDescription,
  sectionKicker,
  selectedItem,
}: ManagementSurfaceEditorSectionProps<T>) {
  if (!selectedItem) {
    return (
      <section className={editorClassName} aria-label={ariaLabel}>
        <ManagementSurfaceEmptyState
          classNamePrefix={classNamePrefix}
          title={emptyStateTitle}
          description={emptyStateDescription}
        />
      </section>
    );
  }

  return (
    <section className={editorClassName} aria-label={ariaLabel}>
      <ManagementSurfaceSectionHeader
        classNamePrefix={classNamePrefix}
        kicker={sectionKicker}
        title={getSelectedItemTitle(selectedItem)}
        description={sectionDescription}
      />

      {children(selectedItem)}
    </section>
  );
}

export const ManagementSurface = {
  EditorSection: ManagementSurfaceEditorSection,
  EmptyState: ManagementSurfaceEmptyState,
  Feedback: ManagementSurfaceFeedback,
  Hero: ManagementSurfaceHero,
  Layout: ManagementSurfaceLayout,
  ListSection: ManagementSurfaceListSection,
  Root: ManagementSurfaceRoot,
  SectionHeader: ManagementSurfaceSectionHeader,
};
