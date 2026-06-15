import type { Label } from '../../../context/TicketContext';

export interface WorkspaceProjectLabelListProps {
  labels: Label[];
  activeLabelId: string | null;
  onSelectLabel: (label: Label) => void;
  managedProjectName: string;
}

export function WorkspaceProjectLabelList({
  labels,
  activeLabelId,
  onSelectLabel,
  managedProjectName,
}: WorkspaceProjectLabelListProps) {
  return (
    <div className="workspace-page__domain-list">
      {labels.length > 0 ? (
        labels.map((label) => (
          <button
            key={label.id}
            type="button"
            className={`workspace-page__domain-chip workspace-page__domain-chip--button ${
              activeLabelId === label.id ? 'workspace-page__domain-chip--active' : ''
            }`}
            onClick={() => onSelectLabel(label)}
            title={label.description || label.name}
            aria-pressed={activeLabelId === label.id}
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
