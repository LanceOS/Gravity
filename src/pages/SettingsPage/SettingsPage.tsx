import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeft, Check, Globe, Link2, Settings2, ShieldCheck, UserPlus, Users } from 'lucide-react';
import type { User } from '../../context/TicketContext';
import type { WorkspaceSummary } from '../../hooks/useWorkspaceDirectory';
import type {
  WorkspaceAdminSettings,
  WorkspaceInvite,
  WorkspaceJoinRequest,
  WorkspaceMember,
} from '../../hooks/useWorkspaceSettings';
import './SettingsPage.css';

type SettingsCategoryId = 'overview' | 'access' | 'members' | 'requests';

interface StatusMessage {
  success: boolean;
  message: string;
}

interface SettingsPageProps {
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
  onBackToWorkspace: () => void;
  onOpenDirectory: () => void;
  onChangeSettings: (updates: Partial<WorkspaceAdminSettings>) => void;
  onSaveSettings: () => void;
  onCreateInvite: (label?: string) => Promise<boolean>;
  onApproveJoinRequest: (requestId: string) => Promise<boolean>;
}

const SETTINGS_CATEGORIES: Array<{
  id: SettingsCategoryId;
  label: string;
  description: string;
  icon: typeof Settings2;
}> = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Workspace identity, host location, and join policy.',
    icon: Settings2,
  },
  {
    id: 'access',
    label: 'Invites',
    description: 'Create invite links and review access entry points.',
    icon: Link2,
  },
  {
    id: 'members',
    label: 'Members',
    description: 'Inspect the people who already belong to this workspace.',
    icon: Users,
  },
  {
    id: 'requests',
    label: 'Join Requests',
    description: 'Approve or review pending access requests.',
    icon: UserPlus,
  },
];

function StatusNotice({ message, tone = 'neutral' }: { message: StatusMessage | { message: string } | null; tone?: 'neutral' | 'success' | 'error' }) {
  if (!message) {
    return null;
  }

  const icon = tone === 'success' ? <Check size={14} /> : tone === 'error' ? <ShieldCheck size={14} /> : null;

  return (
    <div className={`settings-page__notice settings-page__notice--${tone}`}>
      {icon}
      <span>{message.message}</span>
    </div>
  );
}

function OverviewSection({
  workspace,
  settings,
  onChangeSettings,
}: {
  workspace: WorkspaceSummary;
  settings: WorkspaceAdminSettings;
  onChangeSettings: (updates: Partial<WorkspaceAdminSettings>) => void;
}) {
  return (
    <div className="settings-page__section-card">
      <div className="settings-page__section-header">
        <h2 className="settings-page__section-title">Workspace host configuration</h2>
        <p className="settings-page__section-subtitle">This page now controls workspace administration only. Local user preferences and AI credentials are no longer edited here.</p>
      </div>

      <div className="settings-page__grid">
        <label className="settings-page__field">
          <span className="settings-page__label">Workspace Name</span>
          <input className="settings-page__control" value={workspace.name} disabled />
        </label>

        <label className="settings-page__field">
          <span className="settings-page__label">Workspace Key</span>
          <input className="settings-page__control" value={workspace.key} disabled />
        </label>

        <label className="settings-page__field settings-page__field--wide">
          <span className="settings-page__label">Host URL</span>
          <input
            className="settings-page__control"
            value={settings.hostUrl}
            placeholder="http://localhost:5000"
            onChange={(event) => onChangeSettings({ hostUrl: event.target.value })}
          />
        </label>

        <label className="settings-page__field">
          <span className="settings-page__label">Join Policy</span>
          <select
            className="settings-page__control"
            value={settings.joinMode}
            onChange={(event) => onChangeSettings({ joinMode: event.target.value as WorkspaceAdminSettings['joinMode'] })}
          >
            <option value="approval_required">Owner Approval Required</option>
            <option value="auto_join">Auto Join</option>
          </select>
        </label>

        <label className="settings-page__field">
          <span className="settings-page__label">Private Workspace Access Key</span>
          <input
            className="settings-page__control"
            value={settings.workspaceKey}
            onChange={(event) => onChangeSettings({ workspaceKey: event.target.value.toUpperCase() })}
          />
        </label>
      </div>

      <div style={metaGridStyle}>
        <div style={metaCardStyle}>
          <Globe size={16} color="var(--accent)" />
          <div>
            <div style={metaTitleStyle}>Projects</div>
            <div style={metaCopyStyle}>{workspace.projectCount} child projects</div>
          </div>
        </div>

        <div style={metaCardStyle}>
          <Users size={16} color="var(--accent)" />
          <div>
            <div style={metaTitleStyle}>Members</div>
            <div style={metaCopyStyle}>{workspace.memberCount} approved users</div>
          </div>
        </div>

        <div style={metaCardStyle}>
          <UserPlus size={16} color="var(--accent)" />
          <div>
            <div style={metaTitleStyle}>Pending Requests</div>
            <div style={metaCopyStyle}>{workspace.pendingJoinRequestCount} awaiting review</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccessSection({
  invites,
  invitesLoading,
  inviteLoading,
  onCreateInvite,
}: {
  invites: WorkspaceInvite[];
  invitesLoading: boolean;
  inviteLoading: boolean;
  onCreateInvite: (label?: string) => Promise<boolean>;
}) {
  const [label, setLabel] = useState('');

  const handleCreateInvite = async () => {
    const success = await onCreateInvite(label);
    if (success) {
      setLabel('');
    }
  };

  return (
    <div className="settings-page__section-card">
      <div className="settings-page__section-header">
        <h2 className="settings-page__section-title">Invite links</h2>
        <p className="settings-page__section-subtitle">Invite codes create an approval-gated entry point into this workspace. The private workspace key is still required when a member connects.</p>
      </div>

      <div className="settings-page__grid">
        <label className="settings-page__field settings-page__field--wide">
          <span className="settings-page__label">Invite Label</span>
          <input
            className="settings-page__control"
            value={label}
            placeholder="External contractor access"
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
      </div>

      <div className="settings-page__actions-row">
        <button type="button" className="settings-page__secondary-button" onClick={() => void handleCreateInvite()} disabled={inviteLoading}>
          {inviteLoading ? 'Creating...' : 'Create Invite'}
        </button>
      </div>

      {invitesLoading ? <StatusNotice message={{ message: 'Loading invite links...' }} /> : null}
      {!invitesLoading && invites.length === 0 ? <StatusNotice message={{ message: 'No invite links exist yet for this workspace.' }} /> : null}

      {invites.map((invite) => (
        <div key={invite.id} style={listRowStyle}>
          <div>
            <div style={listRowTitleStyle}>{invite.label || invite.code}</div>
            <div style={listRowCopyStyle}>Code: {invite.code}</div>
          </div>

          <div style={listRowMetaStyle}>
            <span>{invite.useCount}{invite.maxUses ? ` / ${invite.maxUses}` : ''} uses</span>
            <span>{invite.pendingJoinRequestCount || 0} pending</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MembersSection({ members }: { members: WorkspaceMember[] }) {
  return (
    <div className="settings-page__section-card">
      <div className="settings-page__section-header">
        <h2 className="settings-page__section-title">Approved members</h2>
        <p className="settings-page__section-subtitle">Workspace membership is the top-level access boundary. Approved users can see the projects inside this workspace.</p>
      </div>

      {members.length === 0 ? <StatusNotice message={{ message: 'No members are assigned to this workspace yet.' }} /> : null}

      {members.map((member) => (
        <div key={member.id} style={memberRowStyle}>
          <div style={memberIdentityStyle}>
            <img src={member.avatar} alt={member.name} className="settings-page__avatar" />
            <div>
              <div style={listRowTitleStyle}>{member.name}</div>
              <div style={listRowCopyStyle}>{member.email}</div>
            </div>
          </div>

          <span style={workspaceRoleStyle}>{member.role}</span>
        </div>
      ))}
    </div>
  );
}

function RequestsSection({
  joinRequests,
  approveLoadingId,
  onApproveJoinRequest,
}: {
  joinRequests: WorkspaceJoinRequest[];
  approveLoadingId: string | null;
  onApproveJoinRequest: (requestId: string) => Promise<boolean>;
}) {
  const pendingRequests = useMemo(
    () => joinRequests.filter((request) => request.status === 'pending'),
    [joinRequests]
  );

  const reviewedRequests = useMemo(
    () => joinRequests.filter((request) => request.status !== 'pending'),
    [joinRequests]
  );

  return (
    <div className="settings-page__section-card">
      <div className="settings-page__section-header">
        <h2 className="settings-page__section-title">Join requests</h2>
        <p className="settings-page__section-subtitle">Every request stays pending until a workspace owner approves it.</p>
      </div>

      {pendingRequests.length === 0 ? <StatusNotice message={{ message: 'No pending join requests right now.' }} /> : null}

      {pendingRequests.map((request) => (
        <div key={request.id} style={memberRowStyle}>
          <div style={memberIdentityStyle}>
            <div style={requestAvatarStyle}>{request.requesterName.slice(0, 1).toUpperCase()}</div>
            <div>
              <div style={listRowTitleStyle}>{request.requesterName}</div>
              <div style={listRowCopyStyle}>{request.requesterEmail}</div>
              {request.message ? <div style={requestMessageStyle}>{request.message}</div> : null}
            </div>
          </div>

          <button
            type="button"
            className="settings-page__secondary-button"
            onClick={() => void onApproveJoinRequest(request.id)}
            disabled={approveLoadingId === request.id}
          >
            {approveLoadingId === request.id ? 'Approving...' : 'Approve'}
          </button>
        </div>
      ))}

      {reviewedRequests.length > 0 ? (
        <div style={reviewedListStyle}>
          <div className="settings-page__eyebrow">Recently Reviewed</div>
          {reviewedRequests.map((request) => (
            <div key={request.id} style={listRowStyle}>
              <div>
                <div style={listRowTitleStyle}>{request.requesterName}</div>
                <div style={listRowCopyStyle}>{request.status} · {request.reviewedByName || 'Unknown reviewer'}</div>
              </div>

              <div style={listRowMetaStyle}>
                <span>{new Date(request.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SettingsPage({
  currentUser,
  workspace,
  settings,
  settingsLoading,
  saveLoading,
  saveSuccess,
  saveError,
  inviteError,
  invitesLoading,
  inviteLoading,
  invites,
  members,
  joinRequests,
  approveLoadingId,
  onBackToWorkspace,
  onOpenDirectory,
  onChangeSettings,
  onSaveSettings,
  onCreateInvite,
  onApproveJoinRequest,
}: SettingsPageProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>('overview');

  const activeCategoryMeta = SETTINGS_CATEGORIES.find((category) => category.id === activeCategory) || SETTINGS_CATEGORIES[0];

  return (
    <div className="settings-page">
      <header className="settings-page__topbar">
        <div className="settings-page__topbar-main">
          <button type="button" className="settings-page__back-button" onClick={onBackToWorkspace}>
            <ArrowLeft size={14} />
            <span>Back to Workspace</span>
          </button>

          <button type="button" className="settings-page__back-button" onClick={onOpenDirectory}>
            <Globe size={14} />
            <span>View Workspaces</span>
          </button>

          <div>
            <h1 className="settings-page__page-title">Workspace Settings</h1>
            <p className="settings-page__page-subtitle">{workspace.name} is managed here without the normal app sidebar. This surface is now dedicated to workspace administration.</p>
          </div>
        </div>

        <button type="button" className="settings-page__save-button" onClick={onSaveSettings} disabled={saveLoading}>
          {saveLoading ? 'Saving...' : saveSuccess ? 'Saved' : 'Save changes'}
        </button>
      </header>

      <div className="settings-page__body">
        <aside className="settings-page__sidebar">
          <div className="settings-page__profile-card">
            <img src={currentUser.avatar} alt={currentUser.name} className="settings-page__avatar" />
            <div>
              <div className="settings-page__profile-name">{currentUser.name}</div>
              <div className="settings-page__profile-email">Managing {workspace.key}</div>
            </div>
          </div>

          <nav className="settings-page__nav">
            {SETTINGS_CATEGORIES.map((category) => {
              const Icon = category.icon;

              return (
                <button
                  key={category.id}
                  type="button"
                  className={`settings-page__nav-item ${activeCategory === category.id ? 'settings-page__nav-item--active' : ''}`}
                  onClick={() => setActiveCategory(category.id)}
                >
                  <Icon size={16} />
                  <div className="settings-page__nav-copy">
                    <span className="settings-page__nav-label">{category.label}</span>
                    <span className="settings-page__nav-description">{category.description}</span>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="settings-page__content">
          <div className="settings-page__content-header">
            <div>
              <div className="settings-page__eyebrow">Selected Category</div>
              <h2 className="settings-page__content-title">{activeCategoryMeta.label}</h2>
              <p className="settings-page__content-subtitle">{activeCategoryMeta.description}</p>
            </div>
          </div>

          {settingsLoading ? <StatusNotice message={{ message: 'Loading workspace administration data...' }} /> : null}
          {saveError ? <StatusNotice message={{ message: saveError }} tone="error" /> : null}
          {inviteError ? <StatusNotice message={{ message: inviteError }} tone="error" /> : null}

          {activeCategory === 'overview' ? (
            <OverviewSection workspace={workspace} settings={settings} onChangeSettings={onChangeSettings} />
          ) : null}

          {activeCategory === 'access' ? (
            <AccessSection
              invites={invites}
              invitesLoading={invitesLoading}
              inviteLoading={inviteLoading}
              onCreateInvite={onCreateInvite}
            />
          ) : null}

          {activeCategory === 'members' ? <MembersSection members={members} /> : null}

          {activeCategory === 'requests' ? (
            <RequestsSection
              joinRequests={joinRequests}
              approveLoadingId={approveLoadingId}
              onApproveJoinRequest={onApproveJoinRequest}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

const metaGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '12px',
};

const metaCardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '14px',
  borderRadius: '14px',
  border: '1px solid var(--border)',
  background: 'rgba(255, 255, 255, 0.02)',
};

const metaTitleStyle: CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-heading)',
};

const metaCopyStyle: CSSProperties = {
  marginTop: '4px',
  fontSize: '12px',
  color: 'var(--text-muted)',
};

const listRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '14px 16px',
  borderRadius: '14px',
  border: '1px solid var(--border)',
  background: 'rgba(255, 255, 255, 0.02)',
};

const listRowTitleStyle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--text-heading)',
};

const listRowCopyStyle: CSSProperties = {
  marginTop: '4px',
  fontSize: '12px',
  color: 'var(--text-muted)',
};

const listRowMetaStyle: CSSProperties = {
  display: 'grid',
  justifyItems: 'end',
  gap: '4px',
  fontSize: '11px',
  color: 'var(--text-muted)',
};

const memberRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '14px 16px',
  borderRadius: '14px',
  border: '1px solid var(--border)',
  background: 'rgba(255, 255, 255, 0.02)',
};

const memberIdentityStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const workspaceRoleStyle: CSSProperties = {
  padding: '6px 10px',
  borderRadius: '999px',
  background: 'rgba(59, 130, 246, 0.08)',
  border: '1px solid rgba(59, 130, 246, 0.18)',
  color: 'var(--text-heading)',
  fontSize: '11px',
  textTransform: 'capitalize',
};

const requestAvatarStyle: CSSProperties = {
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: 'var(--accent-glow)',
  border: '1px solid var(--accent-border)',
  color: 'var(--accent)',
  fontWeight: 700,
};

const requestMessageStyle: CSSProperties = {
  marginTop: '6px',
  fontSize: '12px',
  color: 'var(--text)',
};

const reviewedListStyle: CSSProperties = {
  display: 'grid',
  gap: '10px',
};
