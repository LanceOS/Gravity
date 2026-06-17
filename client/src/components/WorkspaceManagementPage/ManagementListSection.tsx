import type { ReactNode } from 'react';
import { ManagementSurface } from '../ManagementSurface';

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
    <ManagementSurface.ListSection
      classNamePrefix={classNamePrefix}
      sectionClassName={sectionClassName}
      listClassName={listClassName}
      ariaLabel={ariaLabel}
      sectionKicker={sectionKicker}
      sectionTitle={sectionTitle}
      sectionDescription={sectionDescription}
      items={items}
      selectedItemId={selectedItemId}
      emptyStateTitle={emptyStateTitle}
      emptyStateDescription={emptyStateDescription}
      onSelectItem={onSelectItem}
      renderItem={renderItem}
    />
  );
}
