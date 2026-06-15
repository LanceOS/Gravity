import { useWorkspaceProjectPanelProjectStateContext } from '../context/WorkspaceProjectPanelProjectStateContext';

export function WorkspaceProjectLabelSectionHeader() {
  const { managedProject } = useWorkspaceProjectPanelProjectStateContext();
  const managedProjectName = managedProject?.name || 'Selected';

  return (
    <div className="workspace-page__project-domain-header">
      <div>
        <div className="workspace-page__projects-eyebrow">Project Labels</div>
        <h3 className="workspace-page__project-manager-title">{managedProjectName} labels</h3>
      </div>
      <p className="workspace-page__project-browser-copy workspace-page__project-browser-copy--left">
        Use labels for ticket assignment and list sorting.
      </p>
    </div>
  );
}
