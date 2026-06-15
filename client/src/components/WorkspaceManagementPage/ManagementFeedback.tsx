interface WorkspaceManagementFeedbackProps {
  classNamePrefix: string;
  feedback: {
    type: 'success' | 'error';
    message: string;
  } | null;
}

export function WorkspaceManagementFeedback({ classNamePrefix, feedback }: WorkspaceManagementFeedbackProps) {
  if (!feedback) {
    return null;
  }

  return (
    <div className={`${classNamePrefix}__feedback ${classNamePrefix}__feedback--${feedback.type}`}>
      {feedback.message}
    </div>
  );
}
