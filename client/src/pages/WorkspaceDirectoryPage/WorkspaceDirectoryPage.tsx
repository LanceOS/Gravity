import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, FolderPlus, Globe, KeyRound, LogOut, Server, Settings2, Users } from 'lucide-react';
import {
  Button,
  TextInput,
  Textarea,
  Grid,
  Stack,
  Card,
  Badge,
  Alert
} from '@library';
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

const visuallyHiddenStyle: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

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

  const [activeTab, setActiveTab] = useState<'create' | 'join' | 'validate'>('create');

  const workspaceCards = useMemo(() => workspaces.slice().sort((left, right) => left.name.localeCompare(right.name)), [workspaces]);

  const handleCreateSubmit = async (event: FormEvent) => {
    event.preventDefault();

    await onCreateWorkspace({
      name: workspaceName,
      description: workspaceDescription,
      key: workspaceKey,
      workspaceKey: workspaceAccessKey,
      defaultProjectName: workspaceName,
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
    <div
      style={{
        minHeight: '100vh',
        padding: 'var(--space-8) var(--space-6)',
        background: 'var(--color-surface-app)',
        overflowY: 'auto',
      }}
    >
      <div
        className="workspace-directory-grid"
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
        }}
      >
        {/* Left Column: Header, Stats, and Directory Table */}
        <Stack gap="var(--space-5)">
          {/* Elegant Page Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border-default)', paddingBottom: 'var(--space-4)', marginBottom: 'var(--space-1)' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                Workspace Directory
              </h1>
              <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '13px' }}>
                Choose where this account works.
              </p>
              <p style={{ margin: '2px 0 0', color: 'var(--color-text-disabled)', fontSize: '12px' }}>
                Transition seamlessly between connected workspaces or peer-invitations.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button variant="default" size="sm" onClick={onOpenAccountPreferences} leftIcon={<Settings2 size={14} />}>
                Preferences
              </Button>
              <Button variant="ghost" size="sm" onClick={onSignOut} leftIcon={<LogOut size={14} />}>
                Sign Out
              </Button>
            </div>
          </div>

          {/* Compact Horizontal Statistics Bar */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-6)',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-base50)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <FolderPlus size={15} style={{ color: 'var(--color-text-disabled)' }} />
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{workspaces.length}</span>
              <span style={{ color: 'var(--color-text-disabled)' }}>Workspaces</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Users size={15} style={{ color: 'var(--color-text-disabled)' }} />
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{workspaces.reduce((sum, w) => sum + w.memberCount, 0)}</span>
              <span style={{ color: 'var(--color-text-disabled)' }}>Members</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Server size={15} style={{ color: 'var(--color-text-disabled)' }} />
              <span style={{ color: 'var(--color-text-disabled)' }}>Local Account:</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{currentUser.email}</span>
            </div>
          </div>

          {/* High-density Workspaces Directory */}
          <Stack gap="var(--space-3)">
            <div>
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-disabled)' }}>
                Available Boundaries
              </span>
              <h2 style={{ margin: '2px 0 0', fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Connected and Hosted Workspaces
              </h2>
            </div>

            {loading && (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', border: '1px dashed var(--color-border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-disabled)' }}>
                Loading workspaces...
              </div>
            )}

            {!loading && workspaceCards.length === 0 && (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', border: '1px dashed var(--color-border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-disabled)', fontSize: '13px' }}>
                No approved workspaces yet. Create one or request access with an invite code.
              </div>
            )}

            {!loading && workspaceCards.length > 0 && (
              <div style={{ border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--color-surface-card)' }}>
                {/* Table Header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.8fr 1fr 1.2fr 90px 130px',
                    padding: '8px 16px',
                    background: 'var(--color-base50)',
                    borderBottom: '1px solid var(--color-border-default)',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--color-text-disabled)',
                    letterSpacing: '0.05em',
                  }}
                >
                  <div>Workspace</div>
                  <div>Details</div>
                  <div>Endpoint</div>
                  <div>Role</div>
                  <div style={{ textAlign: 'right' }}>Actions</div>
                </div>
                {/* Table Rows */}
                {workspaceCards.map((workspace) => {
                  const isActive = workspace.id === activeWorkspaceId;
                  return (
                    <div
                      key={workspace.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.8fr 1fr 1.2fr 90px 130px',
                        alignItems: 'center',
                        padding: '10px 16px',
                        borderBottom: '1px solid var(--color-border-default)',
                        background: isActive ? 'var(--color-state-selected-bg)' : 'transparent',
                        transition: 'background var(--transition-normal)',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            {workspace.name}
                          </span>
                          {isActive && <Badge variant="accent">Active</Badge>}
                        </div>
                        {workspace.description && (
                          <div
                            style={{
                              fontSize: '11.5px',
                              color: 'var(--color-text-disabled)',
                              marginTop: '2px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '320px',
                            }}
                          >
                            {workspace.description}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        {workspace.projectCount} {workspace.projectCount === 1 ? 'project' : 'projects'} · {workspace.memberCount} {workspace.memberCount === 1 ? 'member' : 'members'}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--color-text-disabled)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {workspace.hostUrl || 'Local Host'}
                      </div>
                      <div>
                        <Badge variant={workspace.memberRole === 'owner' ? 'accent' : 'default'}>
                          {workspace.memberRole || 'member'}
                        </Badge>
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                        <Button variant="primary" size="sm" onClick={() => onOpenWorkspace(workspace.id)} leftIcon={<ArrowRight size={13} />} style={{ minHeight: '26px', padding: '2px 8px' }}>
                          Open
                        </Button>
                        <Button aria-label="Settings" variant="default" size="sm" onClick={() => onOpenSettings(workspace.id)} style={{ minHeight: '26px', padding: '2px 6px' }}>
                          <Settings2 size={13} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Stack>
        </Stack>

        {/* Right Column: Unified Tabbed Action Panel */}
        <div style={{ position: 'sticky', top: 'var(--space-8)' }}>
          <Card style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-default)', background: 'var(--color-surface-card)' }}>
            <Stack gap="var(--space-4)">
              {/* Sleek Underline Tab Headers */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-default)', paddingBottom: '0.1px', marginBottom: 'var(--space-2)' }}>
                <button
                  onClick={() => setActiveTab('create')}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    padding: '8px 2px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: activeTab === 'create' ? 'var(--color-text-primary)' : 'var(--color-text-disabled)',
                    borderBottom: activeTab === 'create' ? '2px solid var(--color-text-primary)' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  Create
                </button>
                <button
                  onClick={() => setActiveTab('join')}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    padding: '8px 2px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: activeTab === 'join' ? 'var(--color-text-primary)' : 'var(--color-text-disabled)',
                    borderBottom: activeTab === 'join' ? '2px solid var(--color-text-primary)' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  Join Code
                </button>
                <button
                  onClick={() => setActiveTab('validate')}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    padding: '8px 2px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: activeTab === 'validate' ? 'var(--color-text-primary)' : 'var(--color-text-disabled)',
                    borderBottom: activeTab === 'validate' ? '2px solid var(--color-text-primary)' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  Peer Invite
                </button>
              </div>

              {/* Status Alert Panels */}
              {errorMessage && (
                <Alert type="error" style={{ marginBottom: 'var(--space-2)' }}>
                  {errorMessage}
                </Alert>
              )}
              {successMessage && (
                <Alert type="success" style={{ marginBottom: 'var(--space-2)' }}>
                  {successMessage}
                </Alert>
              )}

              {/* Form Content Blocks */}
              <form onSubmit={handleCreateSubmit} style={activeTab === 'create' ? {} : visuallyHiddenStyle}>
                <Stack gap="var(--space-3)">
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
                    <Globe size={16} style={{ color: 'var(--color-text-disabled)' }} />
                    <h3 style={{ margin: 0, fontSize: '13.5px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Establish Boundary</h3>
                  </div>
                  <p style={{ margin: 0, color: 'var(--color-text-disabled)', fontSize: '11.5px', lineHeight: 1.4 }}>
                    Create a local cryptographic boundary to run private, secure projects.
                  </p>

                  <TextInput
                    label="Workspace Name"
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    placeholder="e.g. Acme Corp"
                    required
                  />

                  <TextInput
                    label="Workspace Key"
                    value={workspaceKey}
                    onChange={(event) => setWorkspaceKey(event.target.value.toUpperCase())}
                    placeholder="e.g. ACM"
                    maxLength={12}
                    required
                  />

                  <TextInput
                    label="Private Access Key"
                    value={workspaceAccessKey}
                    onChange={(event) => setWorkspaceAccessKey(event.target.value.toUpperCase())}
                    placeholder="Optional (auto-generated)"
                  />

                  <Textarea
                    label="Description"
                    rows={3}
                    value={workspaceDescription}
                    onChange={(event) => setWorkspaceDescription(event.target.value)}
                    placeholder="Purpose of this workspace..."
                  />

                  <Button type="submit" variant="primary" fullWidth loading={pendingAction === 'create'} style={{ marginTop: 'var(--space-2)' }}>
                    Create Workspace
                  </Button>
                </Stack>
              </form>

              <form onSubmit={handleJoinSubmit} style={activeTab === 'join' ? {} : visuallyHiddenStyle}>
                <Stack gap="var(--space-3)">
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
                    <KeyRound size={16} style={{ color: 'var(--color-text-disabled)' }} />
                    <h3 style={{ margin: 0, fontSize: '13.5px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Request Access</h3>
                  </div>
                  <p style={{ margin: 0, color: 'var(--color-text-disabled)', fontSize: '11.5px', lineHeight: 1.4 }}>
                    Enter a valid invite code to request peer authorization on the workspace.
                  </p>

                  <TextInput
                    label="Invite Code"
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                    placeholder="WSP-GRAV-1234"
                    required
                  />

                  <Textarea
                    label="Message"
                    rows={3}
                    value={requestMessage}
                    onChange={(event) => setRequestMessage(event.target.value)}
                    placeholder="Brief note to workspace owner..."
                  />

                  <Button type="submit" variant="primary" fullWidth loading={pendingAction === 'join'} style={{ marginTop: 'var(--space-2)' }}>
                    Send Join Request
                  </Button>
                </Stack>
              </form>

              <form onSubmit={handlePeerValidationSubmit} style={activeTab === 'validate' ? {} : visuallyHiddenStyle}>
                <Stack gap="var(--space-3)">
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
                    <KeyRound size={16} style={{ color: 'var(--color-text-disabled)' }} />
                    <h3 style={{ margin: 0, fontSize: '13.5px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Validate Peer Invite</h3>
                  </div>
                  <p style={{ margin: 0, color: 'var(--color-text-disabled)', fontSize: '11.5px', lineHeight: 1.4 }}>
                    Perform a secure handshake to validate a peer's invite URL and credentials.
                  </p>

                  <TextInput
                    label="Guest Email"
                    type="email"
                    value={peerEmail}
                    onChange={(event) => setPeerEmail(event.target.value)}
                    placeholder="guest-user@peer.com"
                    required
                  />

                  <TextInput
                    label="Validation Code"
                    value={peerValidationCode}
                    onChange={(event) => setPeerValidationCode(event.target.value.toUpperCase())}
                    placeholder="GRAV-9821-X"
                    required
                  />

                  <TextInput
                    label="Invite URL"
                    value={peerInviteUrl}
                    onChange={(event) => setPeerInviteUrl(event.target.value)}
                    placeholder="https://peer-host.com/api/v1/validate"
                    required
                  />

                  <TextInput
                    label="Guest Username"
                    value={peerUsername}
                    onChange={(event) => setPeerUsername(event.target.value)}
                    required
                  />

                  <Textarea
                    label="Password Hash"
                    rows={3}
                    value={peerPasswordHash}
                    onChange={(event) => setPeerPasswordHash(event.target.value)}
                    placeholder="$2b$12$SecureBcryptHash..."
                    required
                  />

                  <Button type="submit" variant="primary" fullWidth loading={pendingAction === 'validate'} style={{ marginTop: 'var(--space-2)' }}>
                    Validate Peer Invite
                  </Button>
                </Stack>
              </form>
            </Stack>
          </Card>
        </div>
      </div>
    </div>
  );
}