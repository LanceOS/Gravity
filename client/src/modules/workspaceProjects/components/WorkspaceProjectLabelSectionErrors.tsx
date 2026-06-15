interface WorkspaceProjectLabelSectionErrorsProps {
  labelFormError: string | null;
  labelCreateError: string | null;
}

export function WorkspaceProjectLabelSectionErrors({
  labelFormError,
  labelCreateError,
}: WorkspaceProjectLabelSectionErrorsProps) {
  const feedback = labelFormError || labelCreateError;

  if (!feedback) {
    return null;
  }

  return <div className="workspace-page__project-feedback workspace-page__project-feedback--error">{feedback}</div>;
}

