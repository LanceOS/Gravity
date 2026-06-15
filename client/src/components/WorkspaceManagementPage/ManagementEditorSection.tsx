import type { ReactNode } from 'react';

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
  if (!selectedItem) {
    return (
      <section className={editorClassName} aria-label={ariaLabel}>
        <div className={`${classNamePrefix}__empty`}>
          <div className={`${classNamePrefix}__empty-title`}>{emptyStateTitle}</div>
          <p>{emptyStateDescription}</p>
        </div>
      </section>
    );
  }

  return (
    <section className={editorClassName} aria-label={ariaLabel}>
      <div className={`${classNamePrefix}__section-header`}>
        <div>
          <div className={`${classNamePrefix}__section-kicker`}>{sectionKicker}</div>
          <h3>{getSelectedItemTitle(selectedItem)}</h3>
        </div>
        <p>{sectionDescription}</p>
      </div>

      {children(selectedItem)}
    </section>
  );
}

