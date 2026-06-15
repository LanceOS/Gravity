import { useWorkspaceProjectPanelLabelStateContext } from '../context/WorkspaceProjectPanelLabelStateContextCore';

interface WorkspaceProjectLabelSectionErrorsProps {
  labelCreateError: string | null;
}

export function WorkspaceProjectLabelSectionErrors({
  labelCreateError,
}: WorkspaceProjectLabelSectionErrorsProps) {
  const { labelFormError } = useWorkspaceProjectPanelLabelStateContext();
  const feedback = labelFormError || labelCreateError;

  if (!feedback) {
    return null;
  }

  return <div className="workspace-page__project-feedback workspace-page__project-feedback--error">{feedback}</div>;
}
