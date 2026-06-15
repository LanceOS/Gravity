import type { WorkspaceTeamsPageFeedback } from '../types/WorkspaceTeamsPage';

interface WorkspaceTeamsFeedbackProps {
  feedback: WorkspaceTeamsPageFeedback | null;
}

export function WorkspaceTeamsFeedback({ feedback }: WorkspaceTeamsFeedbackProps) {
  if (!feedback) {
    return null;
  }

  return (
    <div className={`workspace-teams-page__feedback workspace-teams-page__feedback--${feedback.type}`}>
      {feedback.message}
    </div>
  );
}
