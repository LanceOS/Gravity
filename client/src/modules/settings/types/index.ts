import type { User } from '../../../context/TicketContext';
import type { WorkspaceSummary } from '../../../hooks/useWorkspaceDirectory';
import type {
  CreateWorkspaceInviteInput,
  WorkspaceAdminSettings,
  WorkspaceInvite,
  WorkspaceJoinRequest,
  WorkspaceMember,
} from '../../../hooks/useWorkspaceSettings';

export type SettingsCategoryId = 'overview' | 'access' | 'members' | 'requests' | 'mcp_tools';

export interface SettingsScreenData {
  currentUser: User;
  workspace: WorkspaceSummary;
  settings: WorkspaceAdminSettings;
  settingsLoading: boolean;
  saveLoading: boolean;
  saveSuccess: boolean;
  saveError: string | null;
  inviteError: string | null;
  invitesLoading: boolean;
  inviteLoading: boolean;
  invites: WorkspaceInvite[];
  members: WorkspaceMember[];
  joinRequests: WorkspaceJoinRequest[];
  approveLoadingId: string | null;
  revokeLoadingId: string | null;
}

export interface SettingsScreenActions {
  onBackToWorkspace: () => void;
  onOpenDirectory: () => void;
  onChangeSettings: (updates: Partial<WorkspaceAdminSettings>) => void;
  onSaveSettings: () => void;
  onCreateInvite: (input: CreateWorkspaceInviteInput) => Promise<boolean>;
  onRevokeInvite: (inviteId: string) => Promise<boolean>;
  onApproveJoinRequest: (requestId: string) => Promise<boolean>;
  deleteLoading?: boolean;
  deleteError?: string | null;
  onDeleteWorkspace?: () => Promise<void>;
  onClearDeleteError?: () => void;
}

export interface SettingsScreenProps extends SettingsScreenData, SettingsScreenActions {}
