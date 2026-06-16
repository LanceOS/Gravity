import type { ReactNode } from 'react';
import { ManagementSurface } from '../ManagementSurface';

interface WorkspaceManagementEditorSectionProps<T> {
  classNamePrefix: string;
  editorClassName: string;
  ariaLabel: string;
  sectionKicker: string;
  sectionDescription: string;
  selectedItem: T | null;
  emptyStateTitle: string;
  emptyStateDescription: string;
  getSelectedItemTitle: (item: T) => string;
  children: (item: T) => ReactNode;
}

export function WorkspaceManagementEditorSection<T>({
  classNamePrefix,
  editorClassName,
  ariaLabel,
  sectionKicker,
  sectionDescription,
  selectedItem,
  emptyStateTitle,
  emptyStateDescription,
  getSelectedItemTitle,
  children,
}: WorkspaceManagementEditorSectionProps<T>) {
  return (
    <ManagementSurface.EditorSection
      classNamePrefix={classNamePrefix}
      editorClassName={editorClassName}
      ariaLabel={ariaLabel}
      sectionKicker={sectionKicker}
      sectionDescription={sectionDescription}
      selectedItem={selectedItem}
      emptyStateTitle={emptyStateTitle}
      emptyStateDescription={emptyStateDescription}
      getSelectedItemTitle={getSelectedItemTitle}
    >
      {children}
    </ManagementSurface.EditorSection>
  );
}
