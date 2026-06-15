import type { WorkspaceTeamProjectsPanelFeedback } from '../types/WorkspaceTeamProjectsPanel';

interface WorkspaceTeamProjectsFeedbackProps {
  feedback: WorkspaceTeamProjectsPanelFeedback | null;
}

export function WorkspaceTeamProjectsFeedback({ feedback }: WorkspaceTeamProjectsFeedbackProps) {
  if (!feedback) {
    return null;
  }

  return (
    <div className={`workspace-team-projects-page__feedback workspace-team-projects-page__feedback--${feedback.type}`}>
      {feedback.message}
    </div>
  );
}

