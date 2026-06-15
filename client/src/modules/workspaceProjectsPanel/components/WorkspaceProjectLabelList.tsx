import type { Label } from '../../../context/TicketContext';
import { useWorkspaceProjectPanelActionsContext } from '../context/WorkspaceProjectPanelActionsContext';
import { useWorkspaceProjectPanelLabelStateContext } from '../context/WorkspaceProjectPanelLabelStateContextCore';
import { useWorkspaceProjectPanelProjectStateContext } from '../context/WorkspaceProjectPanelProjectStateContext';

export function WorkspaceProjectLabelList() {
  const { sortedLabels, editingLabelId } = useWorkspaceProjectPanelLabelStateContext();
  const { startEditingLabel } = useWorkspaceProjectPanelActionsContext();
  const { managedProject } = useWorkspaceProjectPanelProjectStateContext();

  const managedProjectName = managedProject?.name || 'this project';

  return (
    <div className="workspace-page__domain-list">
      {sortedLabels.length > 0 ? (
        sortedLabels.map((label: Label) => (
          <button
            key={label.id}
            type="button"
            className={`workspace-page__domain-chip workspace-page__domain-chip--button ${
              editingLabelId === label.id ? 'workspace-page__domain-chip--active' : ''
            }`}
            onClick={() => startEditingLabel(label)}
            title={label.description || label.name}
            aria-pressed={editingLabelId === label.id}
          >
            <span className="workspace-page__domain-chip-swatch" style={{ background: label.color }} />
            <span>{label.name}</span>
          </button>
        ))
      ) : (
        <div className="workspace-page__domain-empty">
          No labels yet. Create the first label for {managedProjectName}.
        </div>
      )}
    </div>
  );
}
