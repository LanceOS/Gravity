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
    <div
      style={{
        minHeight: '100vh',
        padding: 'var(--space-8)',
        background: 'var(--bg)',
      }}
    >
      <Grid
        columns="repeat(auto-fit, minmax(320px, 1fr))"
        gap="var(--space-6)"
        style={{
          maxWidth: '1480px',
          margin: '0 auto',
          alignItems: 'start',
        }}
      >
        {/* Left Column: Hero & Profile Info */}
        <Stack gap="var(--space-5)" style={{ position: 'sticky', top: 'var(--space-6)' }}>
          <Card style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)' }}>
            <Stack gap="var(--space-4)">
              <div style={{ display: 'inline-flex', alignSelf: 'flex-start' }}>
                <Badge variant="accent">Workspace Directory</Badge>
              </div>
              <h1 style={{ margin: 0, fontSize: '38px', fontWeight: 700, lineHeight: 1.05, color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
                Choose where this account works.
              </h1>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6 }}>
                Sign in once, then transition seamlessly between workspaces you host locally or validate peer invitations from remote nodes.
              </p>

              <Stack gap="var(--space-3)" style={{ marginTop: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--card-hover)', border: '1px solid var(--border)' }}>
                  <FolderPlus size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-heading)' }}>{workspaces.length} connected workspaces</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--card-hover)', border: '1px solid var(--border)' }}>
                  <Users size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-heading)' }}>{workspaces.reduce((sum, workspace) => sum + workspace.memberCount, 0)} total members visible</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--card-hover)', border: '1px solid var(--border)' }}>
                  <Server size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-heading)', wordBreak: 'break-all' }}>Local account: {currentUser.email}</span>
                </div>
              </Stack>

              {errorMessage && (
                <Alert type="error" style={{ marginTop: 'var(--space-2)' }}>
                  {errorMessage}
                </Alert>
              )}
              {successMessage && (
                <Alert type="success" style={{ marginTop: 'var(--space-2)' }}>
                  {successMessage}
                </Alert>
              )}

              <Grid columns={2} gap="var(--space-3)" style={{ marginTop: 'var(--space-3)' }}>
                <Button variant="default" size="sm" onClick={onOpenAccountPreferences} leftIcon={<Settings2 size={14} />}>
                  Preferences
                </Button>
                <Button variant="ghost" size="sm" onClick={onSignOut} leftIcon={<LogOut size={14} />}>
                  Sign Out
                </Button>
              </Grid>
            </Stack>
          </Card>
        </Stack>

        {/* Center Column: Available Workspaces */}
        <Stack gap="var(--space-4)">
          <div>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Available Workspaces
            </span>
            <h2 style={{ margin: '4px 0 0', fontSize: '22px', fontWeight: 600, color: 'var(--text-heading)' }}>
              Connected and Hosted
            </h2>
          </div>

          <Stack gap="var(--space-4)">
            {loading && (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
                Loading workspaces...
              </div>
            )}

            {!loading && workspaceCards.length === 0 && (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6 }}>
                No approved workspaces yet. Create one or request access with an invite code.
              </div>
            )}

            {!loading && workspaceCards.map((workspace) => {
              const isActive = workspace.id === activeWorkspaceId;
              return (
                <Card
                  key={workspace.id}
                  style={{
                    padding: 'var(--space-5)',
                    borderRadius: 'var(--radius-lg)',
                    border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                    boxShadow: isActive ? '0 0 16px var(--accent-glow)' : 'var(--shadow-sm)',
                    background: isActive ? 'var(--accent-glow)' : 'var(--card-bg)',
                    transition: 'all var(--transition-normal)',
                  }}
                >
                  <Stack gap="var(--space-3)">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-heading)' }}>
                          {workspace.name}
                        </h3>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                          {workspace.projectCount} projects · {workspace.memberCount} members · {workspace.hostUrl || 'Local host'}
                        </div>
                      </div>
                      <Badge variant={workspace.memberRole === 'owner' ? 'accent' : 'default'}>
                        {workspace.memberRole || 'member'}
                      </Badge>
                    </div>

                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5 }}>
                      {workspace.description || 'No workspace description provided.'}
                    </p>

                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                      <Button variant="primary" size="sm" onClick={() => onOpenWorkspace(workspace.id)} leftIcon={<ArrowRight size={14} />}>
                        Open
                      </Button>
                      <Button variant="default" size="sm" onClick={() => onOpenSettings(workspace.id)} leftIcon={<Settings2 size={14} />}>
                        Settings
                      </Button>
                    </div>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        </Stack>

        {/* Right Column: Actions / Forms Panel */}
        <Stack gap="var(--space-5)" style={{ maxHeight: 'calc(100vh - var(--space-8))', overflowY: 'auto', paddingRight: '4px' }}>
          {/* Create Workspace */}
          <Card style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)' }}>
            <form onSubmit={handleCreateSubmit}>
              <Stack gap="var(--space-4)">
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                  <Globe size={18} style={{ color: 'var(--accent)', marginTop: '2px' }} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-heading)' }}>Create Workspace</h3>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
                      Establish a new secure boundary for your projects, tickets, and peer validation.
                    </p>
                  </div>
                </div>

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
                  placeholder="Optional (auto-generated if empty)"
                />

                <Textarea
                  label="Description"
                  rows={3}
                  value={workspaceDescription}
                  onChange={(event) => setWorkspaceDescription(event.target.value)}
                  placeholder="Briefly describe the purpose of this workspace..."
                />

                <Button type="submit" variant="primary" fullWidth loading={pendingAction === 'create'}>
                  Create Workspace
                </Button>
              </Stack>
            </form>
          </Card>

          {/* Request Access */}
          <Card style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)' }}>
            <form onSubmit={handleJoinSubmit}>
              <Stack gap="var(--space-4)">
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                  <KeyRound size={18} style={{ color: 'var(--accent)', marginTop: '2px' }} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-heading)' }}>Request Access</h3>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
                      Enter an invite code provided by a workspace owner to request join approval.
                    </p>
                  </div>
                </div>

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
                  placeholder="Optional note introducing yourself to the workspace owner..."
                />

                <Button type="submit" variant="default" fullWidth loading={pendingAction === 'join'}>
                  Send Join Request
                </Button>
              </Stack>
            </form>
          </Card>

          {/* Validate Peer Invite */}
          <Card style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)' }}>
            <form onSubmit={handlePeerValidationSubmit}>
              <Stack gap="var(--space-4)">
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                  <KeyRound size={18} style={{ color: 'var(--accent)', marginTop: '2px' }} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-heading)' }}>Validate Peer Invite</h3>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
                      Connect guest profiles to remote hosts securely.
                    </p>
                  </div>
                </div>

                <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--card-hover)', border: '1px solid var(--border)', fontSize: '11px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-heading)', marginBottom: '4px' }}>Peer Handshake Requirements</div>
                  Paste the host endpoint, guest credentials, and a client-side generated bcrypt password hash.
                </div>

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
                  placeholder="https://host-domain-or-ip.com/api/v1/workspaces/validate"
                  required
                />

                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '-8px' }}>
                  Should point to the host server's validation endpoint.
                </div>

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
                  placeholder="$2b$12$SecureBcryptHashHere..."
                  required
                />

                <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.15)', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  The hash stays in the validation record so the host can authenticate guest clients without exposing raw passwords.
                </div>

                <Button type="submit" variant="default" fullWidth loading={pendingAction === 'validate'}>
                  Validate Peer Invite
                </Button>
              </Stack>
            </form>
          </Card>
        </Stack>
      </Grid>
    </div>
  );
}