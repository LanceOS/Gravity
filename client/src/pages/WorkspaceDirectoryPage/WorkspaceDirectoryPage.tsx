import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowRight, FolderPlus, Globe, KeyRound, LogOut, Server, Settings2, Users } from 'lucide-react';
import type { User } from '../../context/TicketContext';
import type { CreateWorkspaceInput, ValidatePeerInviteInput, WorkspaceSummary } from '../../hooks/useWorkspaceDirectory';

interface WorkspaceDirectoryPageProps {
  currentUser: User;
  workspaces: WorkspaceSummary[];
  loading: boolean;
  activeWorkspaceId: string;
  pendingAction: 'create' | 'join' | 'validate' | null;
  errorMessage: string | null;
  successMessage: string | null;
  onCreateWorkspace: (input: CreateWorkspaceInput) => Promise<void>;
  onRequestJoin: (inviteCode: string, message?: string) => Promise<void>;
  onValidatePeerInvite: (input: ValidatePeerInviteInput) => Promise<void>;
  onOpenWorkspace: (workspaceId: string) => void;
  onOpenSettings: (workspaceId: string) => void;
  onOpenAccountPreferences: () => void;
  onSignOut: () => void;
}

export function WorkspaceDirectoryPage({
  currentUser,
  workspaces,
  loading,
  activeWorkspaceId,
  pendingAction,
  errorMessage,
  successMessage,
  onCreateWorkspace,
  onRequestJoin,
  onValidatePeerInvite,
  onOpenWorkspace,
  onOpenSettings,
  onOpenAccountPreferences,
  onSignOut,
}: WorkspaceDirectoryPageProps) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceKey, setWorkspaceKey] = useState('');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [workspaceAccessKey, setWorkspaceAccessKey] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [peerEmail, setPeerEmail] = useState('');
  const [peerValidationCode, setPeerValidationCode] = useState('');
  const [peerInviteUrl, setPeerInviteUrl] = useState('');
  const [peerUsername, setPeerUsername] = useState(`${currentUser.name}Guest`);
  const [peerPasswordHash, setPeerPasswordHash] = useState('');

  const workspaceCards = useMemo(() => workspaces.slice().sort((left, right) => left.name.localeCompare(right.name)), [workspaces]);

  const handleCreateSubmit = async (event: FormEvent) => {
    event.preventDefault();

    await onCreateWorkspace({
      name: workspaceName,
      description: workspaceDescription,
      key: workspaceKey,
      workspaceKey: workspaceAccessKey,
      defaultProjectName: `${workspaceName} Core`,
      defaultProjectKey: workspaceKey,
    });
  };

  const handleJoinSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onRequestJoin(inviteCode, requestMessage);
  };

  const handlePeerValidationSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onValidatePeerInvite({
      email: peerEmail,
      validationCode: peerValidationCode,
      inviteUrl: peerInviteUrl,
      username: peerUsername,
      passwordHash: peerPasswordHash,
    });
  };

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        <section style={heroStyle}>
          <div style={heroBadgeStyle}>Workspace Directory</div>
          <h1 style={heroTitleStyle}>Choose where this account works.</h1>
          <p style={heroCopyStyle}>
            Sign in once, then move between the workspaces you host or the workspaces you join from other machines.
          </p>

          <div style={summaryGridStyle}>
            <div style={summaryCardStyle}>
              <FolderPlus size={18} color="var(--accent)" />
              <span>{workspaces.length} connected workspaces</span>
            </div>
            <div style={summaryCardStyle}>
              <Users size={18} color="var(--accent)" />
              <span>{workspaces.reduce((sum, workspace) => sum + workspace.memberCount, 0)} total members visible</span>
            </div>
            <div style={summaryCardStyle}>
              <Server size={18} color="var(--accent)" />
              <span>Local account: {currentUser.email}</span>
            </div>
          </div>

          {errorMessage ? <div style={errorStyle}>{errorMessage}</div> : null}
          {successMessage ? <div style={successStyle}>{successMessage}</div> : null}

          <div style={heroActionsStyle}>
            <button type="button" className="btn" style={accountButtonStyle} onClick={onOpenAccountPreferences}>
              <Settings2 size={14} />
              Account Preferences
            </button>

            <button type="button" className="btn" style={signOutButtonStyle} onClick={onSignOut}>
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </section>

        <section style={workspaceColumnStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <div style={eyebrowStyle}>Available Workspaces</div>
              <h2 style={sectionTitleStyle}>Connected and hosted workspaces</h2>
            </div>
          </div>

          <div style={workspaceListStyle}>
            {loading ? <div style={emptyCardStyle}>Loading workspaces...</div> : null}

            {!loading && workspaceCards.length === 0 ? (
              <div style={emptyCardStyle}>No approved workspaces yet. Create one below or request access with an invite.</div>
            ) : null}

            {!loading
              ? workspaceCards.map((workspace) => (
                  <article key={workspace.id} style={workspaceCardStyle(workspace.id === activeWorkspaceId)}>
                    <div style={workspaceCardTopStyle}>
                      <div>
                        <div style={workspaceNameStyle}>{workspace.name}</div>
                        <div style={workspaceMetaStyle}>
                          {workspace.projectCount} projects · {workspace.memberCount} members · {workspace.hostUrl || 'Local host'}
                        </div>
                      </div>

                      <span style={workspaceRolePillStyle}>{workspace.memberRole || 'member'}</span>
                    </div>

                    <p style={workspaceDescriptionStyle}>{workspace.description || 'No workspace description yet.'}</p>

                    <div style={workspaceActionsStyle}>
                      <button type="button" className="btn btn-primary" onClick={() => onOpenWorkspace(workspace.id)}>
                        <ArrowRight size={14} />
                        Open Workspace
                      </button>

                      <button type="button" className="btn" onClick={() => onOpenSettings(workspace.id)}>
                        <Settings2 size={14} />
                        Settings
                      </button>
                    </div>
                  </article>
                ))
              : null}
          </div>
        </section>

        <section style={formsColumnStyle}>
          <form onSubmit={handleCreateSubmit} style={panelStyle}>
            <div style={panelHeaderStyle}>
              <Globe size={18} color="var(--accent)" />
              <div>
                <h2 style={panelTitleStyle}>Create Workspace</h2>
                <p style={panelCopyStyle}>A workspace can hold multiple projects and becomes the host boundary for invites.</p>
              </div>
            </div>

            <label style={fieldStyle}>
              <span className="label">Workspace Name</span>
              <input className="input" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} required />
            </label>

            <label style={fieldStyle}>
              <span className="label">Workspace Key</span>
              <input
                className="input"
                value={workspaceKey}
                onChange={(event) => setWorkspaceKey(event.target.value.toUpperCase())}
                placeholder="GRAV"
                maxLength={12}
                required
              />
            </label>

            <label style={fieldStyle}>
              <span className="label">Private Access Key</span>
              <input
                className="input"
                value={workspaceAccessKey}
                onChange={(event) => setWorkspaceAccessKey(event.target.value.toUpperCase())}
                placeholder="Optional - auto-generated if blank"
              />
            </label>

            <label style={fieldStyle}>
              <span className="label">Description</span>
              <textarea
                className="input"
                rows={3}
                value={workspaceDescription}
                onChange={(event) => setWorkspaceDescription(event.target.value)}
                style={{ resize: 'vertical' }}
              />
            </label>

            <button type="submit" className="btn btn-primary" disabled={pendingAction !== null}>
              {pendingAction === 'create' ? 'Creating...' : 'Create Workspace'}
            </button>
          </form>

          <form onSubmit={handleJoinSubmit} style={panelStyle}>
            <div style={panelHeaderStyle}>
              <KeyRound size={18} color="var(--accent)" />
              <div>
                <h2 style={panelTitleStyle}>Request Access</h2>
                <p style={panelCopyStyle}>Use an invite code from another workspace owner. Approval is required before you can connect.</p>
              </div>
            </div>

            <label style={fieldStyle}>
              <span className="label">Invite Code</span>
              <input
                className="input"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                placeholder="WSP-GRAV-1234"
                required
              />
            </label>

            <label style={fieldStyle}>
              <span className="label">Message</span>
              <textarea
                className="input"
                rows={3}
                value={requestMessage}
                onChange={(event) => setRequestMessage(event.target.value)}
                placeholder="Optional note for the workspace owner"
                style={{ resize: 'vertical' }}
              />
            </label>

            <button type="submit" className="btn" disabled={pendingAction !== null}>
              {pendingAction === 'join' ? 'Sending...' : 'Send Join Request'}
            </button>
          </form>

          <form onSubmit={handlePeerValidationSubmit} style={panelStyle}>
            <div style={panelHeaderStyle}>
              <KeyRound size={18} color="var(--accent)" />
              <div>
                <h2 style={panelTitleStyle}>Validate Peer Invite</h2>
                <p style={panelCopyStyle}>Paste the guest validation link details from the host. This switches the client into the validated guest workspace profile.</p>
              </div>
            </div>

            <label style={fieldStyle}>
              <span className="label">Guest Email</span>
              <input className="input" value={peerEmail} onChange={(event) => setPeerEmail(event.target.value)} placeholder="guest-user@peer.com" required />
            </label>

            <label style={fieldStyle}>
              <span className="label">Validation Code</span>
              <input
                className="input"
                value={peerValidationCode}
                onChange={(event) => setPeerValidationCode(event.target.value.toUpperCase())}
                placeholder="GRAV-9821-X"
                required
              />
            </label>

            <label style={fieldStyle}>
              <span className="label">Invite URL</span>
              <input className="input" value={peerInviteUrl} onChange={(event) => setPeerInviteUrl(event.target.value)} placeholder="https://host-domain-or-ip.com/api/v1/workspaces/validate" required />
            </label>

            <label style={fieldStyle}>
              <span className="label">Guest Username</span>
              <input className="input" value={peerUsername} onChange={(event) => setPeerUsername(event.target.value)} required />
            </label>

            <label style={fieldStyle}>
              <span className="label">Password Hash</span>
              <textarea
                className="input"
                rows={3}
                value={peerPasswordHash}
                onChange={(event) => setPeerPasswordHash(event.target.value)}
                placeholder="$2b$12$SecureBcryptHashHere..."
                style={{ resize: 'vertical' }}
                required
              />
            </label>

            <button type="submit" className="btn" disabled={pendingAction !== null}>
              {pendingAction === 'validate' ? 'Validating...' : 'Validate Peer Invite'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  padding: '32px',
  background:
    'radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 26%), radial-gradient(circle at bottom right, rgba(16, 185, 129, 0.08), transparent 28%), var(--bg)',
};

const shellStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 1.1fr) minmax(320px, 0.95fr)',
  gap: '24px',
  maxWidth: '1480px',
  margin: '0 auto',
};

const heroStyle: CSSProperties = {
  padding: '28px',
  borderRadius: '24px',
  border: '1px solid var(--border)',
  background: 'var(--card-bg)',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const heroBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignSelf: 'flex-start',
  padding: '6px 10px',
  borderRadius: '999px',
  border: '1px solid var(--accent-border)',
  background: 'var(--accent-glow)',
  color: 'var(--accent)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

const heroTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: '42px',
  lineHeight: 1.02,
  color: 'var(--text-heading)',
};

const heroCopyStyle: CSSProperties = {
  margin: 0,
  color: 'var(--text-muted)',
  fontSize: '15px',
  lineHeight: 1.7,
  maxWidth: '42ch',
};

const summaryGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
  gap: '12px',
};

const summaryCardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid var(--border)',
  background: 'rgba(255, 255, 255, 0.03)',
  color: 'var(--text-heading)',
};

const sectionHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
};

const sectionTitleStyle: CSSProperties = {
  margin: '6px 0 0',
  fontSize: '22px',
  color: 'var(--text-heading)',
};

const eyebrowStyle: CSSProperties = {
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const workspaceColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const workspaceListStyle: CSSProperties = {
  display: 'grid',
  gap: '14px',
};

const workspaceCardStyle = (isActive: boolean): CSSProperties => ({
  padding: '22px',
  borderRadius: '22px',
  border: isActive ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid var(--border)',
  background: isActive ? 'rgba(59, 130, 246, 0.08)' : 'var(--card-bg)',
  display: 'grid',
  gap: '14px',
});

const workspaceCardTopStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '12px',
};

const workspaceNameStyle: CSSProperties = {
  fontSize: '20px',
  fontWeight: 600,
  color: 'var(--text-heading)',
};

const workspaceMetaStyle: CSSProperties = {
  marginTop: '6px',
  fontSize: '12px',
  color: 'var(--text-muted)',
};

const workspaceRolePillStyle: CSSProperties = {
  padding: '5px 8px',
  borderRadius: '999px',
  background: 'rgba(255, 255, 255, 0.06)',
  border: '1px solid var(--border)',
  fontSize: '11px',
  color: 'var(--text-heading)',
  textTransform: 'capitalize',
};

const workspaceDescriptionStyle: CSSProperties = {
  margin: 0,
  color: 'var(--text-muted)',
  fontSize: '14px',
  lineHeight: 1.6,
};

const workspaceActionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '10px',
};

const formsColumnStyle: CSSProperties = {
  display: 'grid',
  gap: '16px',
  alignContent: 'start',
};

const panelStyle: CSSProperties = {
  padding: '24px',
  borderRadius: '22px',
  border: '1px solid var(--border)',
  background: 'var(--card-bg)',
  display: 'grid',
  gap: '14px',
};

const panelHeaderStyle: CSSProperties = {
  display: 'flex',
  gap: '12px',
  alignItems: 'flex-start',
};

const panelTitleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--text-heading)',
  fontSize: '18px',
};

const panelCopyStyle: CSSProperties = {
  margin: '6px 0 0',
  color: 'var(--text-muted)',
  fontSize: '13px',
  lineHeight: 1.6,
};

const fieldStyle: CSSProperties = {
  display: 'grid',
  gap: '6px',
};

const errorStyle: CSSProperties = {
  padding: '12px 14px',
  borderRadius: '14px',
  border: '1px solid rgba(239, 68, 68, 0.2)',
  background: 'rgba(239, 68, 68, 0.08)',
  color: '#ef4444',
  fontSize: '13px',
};

const successStyle: CSSProperties = {
  padding: '12px 14px',
  borderRadius: '14px',
  border: '1px solid rgba(16, 185, 129, 0.2)',
  background: 'rgba(16, 185, 129, 0.08)',
  color: '#10b981',
  fontSize: '13px',
};

const emptyCardStyle: CSSProperties = {
  padding: '20px',
  borderRadius: '18px',
  border: '1px dashed var(--border)',
  background: 'rgba(255, 255, 255, 0.02)',
  color: 'var(--text-muted)',
  lineHeight: 1.6,
};

const signOutButtonStyle: CSSProperties = {
  gap: '8px',
};

const heroActionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '10px',
};

const accountButtonStyle: CSSProperties = {
  gap: '8px',
};