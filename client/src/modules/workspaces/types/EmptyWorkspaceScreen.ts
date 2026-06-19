import type { User } from '../../../context/TicketContextContext';

export interface EmptyWorkspaceScreenProps {
  currentUser: User;
  pendingAction: 'create' | 'join' | null;
  errorMessage: string | null;
  onCreateProject: (project: { name: string; description: string; key: string }) => Promise<void>;
  onJoinProject: (inviteCode: string) => Promise<void>;
  onSignOut: () => void;
}