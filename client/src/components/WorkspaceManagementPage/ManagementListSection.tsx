import type { ReactNode } from 'react';

interface WorkspaceManagementListSectionItemProps<T> {
  item: T;
  isSelected: boolean;
  onSelect: () => void;
}

interface WorkspaceManagementListSectionProps<T extends { id: string }> {
  classNamePrefix: string;
  sectionClassName: string;
  listClassName: string;
  ariaLabel: string;
  sectionKicker: string;
  sectionTitle: string;
  sectionDescription: string;
  items: T[];
  selectedItemId: string;
  emptyStateTitle: string;
  emptyStateDescription: string;
  onSelectItem: (itemId: string) => void;
  renderItem: (props: WorkspaceManagementListSectionItemProps<T>) => ReactNode;
}

export function WorkspaceManagementListSection<T extends { id: string }>({
  classNamePrefix,
  sectionClassName,
  listClassName,
  ariaLabel,
  sectionKicker,
  sectionTitle,
  sectionDescription,
  items,
  selectedItemId,
  emptyStateTitle,
  emptyStateDescription,
  onSelectItem,
  renderItem,
}: WorkspaceManagementListSectionProps<T>) {
  return (
    <section className={sectionClassName} aria-label={ariaLabel}>
      <div className={`${classNamePrefix}__section-header`}>
        <div>
          <div className={`${classNamePrefix}__section-kicker`}>{sectionKicker}</div>
          <h3>{sectionTitle}</h3>
        </div>
        <p>{sectionDescription}</p>
      </div>

      {items.length === 0 ? (
        <div className={`${classNamePrefix}__empty`}>
          <div className={`${classNamePrefix}__empty-title`}>{emptyStateTitle}</div>
          <p>{emptyStateDescription}</p>
        </div>
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

