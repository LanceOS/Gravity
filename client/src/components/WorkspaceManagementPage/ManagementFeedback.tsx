import { ManagementSurface } from '../ManagementSurface';

interface WorkspaceManagementFeedbackProps {
  classNamePrefix: string;
  feedback: {
    type: 'success' | 'error';
    message: string;
  } | null;
}

export function WorkspaceManagementFeedback({ classNamePrefix, feedback }: WorkspaceManagementFeedbackProps) {
  return <ManagementSurface.Feedback classNamePrefix={classNamePrefix} feedback={feedback} />;
}
