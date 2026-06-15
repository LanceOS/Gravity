import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@library';

interface WorkspaceTeamProjectsHeaderActionsProps {
  onBackToTeams: () => void;
  onOpenCreateProject: () => void;
  canCreateProject: boolean;
}

export function WorkspaceTeamProjectsHeaderActions({
  onBackToTeams,
  onOpenCreateProject,
  canCreateProject,
}: WorkspaceTeamProjectsHeaderActionsProps) {
  return (
    <div className="workspace-team-projects-page__actions">
      <Button type="button" variant="ghost" size="sm" onClick={onBackToTeams}>
        <ArrowLeft size={14} />
        <span>Back to Teams</span>
      </Button>
      <Button type="button" variant="primary" size="sm" onClick={onOpenCreateProject} disabled={!canCreateProject}>
        <Sparkles size={14} />
        <span>New Project</span>
      </Button>
    </div>
  );
}

