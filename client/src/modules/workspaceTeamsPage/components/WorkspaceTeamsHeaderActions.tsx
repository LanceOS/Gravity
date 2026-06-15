import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@library';

interface WorkspaceTeamsHeaderActionsProps {
  onBackToWorkspace: () => void;
  onOpenCreateTeam: () => void;
}

export function WorkspaceTeamsHeaderActions({ onBackToWorkspace, onOpenCreateTeam }: WorkspaceTeamsHeaderActionsProps) {
  return (
    <div className="workspace-teams-page__actions">
      <Button type="button" variant="ghost" size="sm" onClick={onBackToWorkspace}>
        <ArrowLeft size={14} />
        <span>Back to Workspace</span>
      </Button>
      <Button type="button" variant="primary" size="sm" onClick={onOpenCreateTeam}>
        <Sparkles size={14} />
        <span>New Team</span>
      </Button>
    </div>
  );
}
