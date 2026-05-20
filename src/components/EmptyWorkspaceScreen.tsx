import React, { useState } from 'react';
import { FolderPlus, LogOut, Sparkles, Ticket, Users } from 'lucide-react';
import type { User } from '../context/TicketContext';

interface EmptyWorkspaceScreenProps {
  currentUser: User;
  pendingAction: 'create' | 'join' | null;
  errorMessage: string | null;
  onCreateProject: (project: { name: string; description: string; key: string }) => Promise<void>;
  onJoinProject: (inviteCode: string) => Promise<void>;
  onSignOut: () => void;
}

export const EmptyWorkspaceScreen: React.FC<EmptyWorkspaceScreenProps> = ({
  currentUser,
  pendingAction,
  errorMessage,
  onCreateProject,
  onJoinProject,
  onSignOut,
}) => {
  const [projectName, setProjectName] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const handleCreateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onCreateProject({
      name: projectName,
      key: projectKey,
      description: projectDescription,
    });
  };

  const handleJoinSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onJoinProject(inviteCode);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        background: 'radial-gradient(circle at top, var(--accent-glow) 0%, transparent 35%), var(--bg)',
        color: 'var(--text)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1040px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
          gap: '24px',
        }}
      >
        <section
          style={{
            padding: '36px',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            background: 'var(--card-bg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '16px',
                display: 'grid',
                placeItems: 'center',
                background: 'var(--accent-glow)',
                border: '1px solid var(--accent-border)',
              }}
            >
              <Sparkles size={24} color="var(--accent)" />
            </div>

            <div>
              <h1 style={{ fontSize: '30px', lineHeight: 1.1, color: 'var(--text-heading)' }}>
                Welcome, {currentUser.name}
              </h1>
              <p style={{ marginTop: '6px', color: 'var(--text-muted)', fontSize: '14px' }}>
                Your workspace is empty. Create your first project or join an existing one by invite.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
            <div style={infoCardStyle}>
              <FolderPlus size={18} color="var(--accent)" />
              <span>Create the first project space</span>
            </div>
            <div style={infoCardStyle}>
              <Users size={18} color="var(--accent)" />
              <span>Join teammates by invite code</span>
            </div>
            <div style={infoCardStyle}>
              <Ticket size={18} color="var(--accent)" />
              <span>Add tickets after the project exists</span>
            </div>
          </div>

          {errorMessage && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                background: 'rgba(239, 68, 68, 0.08)',
                color: '#ef4444',
                fontSize: '13px',
              }}
            >
              {errorMessage}
            </div>
          )}

          <button
            type="button"
            onClick={onSignOut}
            className="btn"
            style={{ alignSelf: 'flex-start', gap: '8px' }}
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </section>

        <section style={{ display: 'grid', gap: '16px' }}>
          <form onSubmit={handleCreateSubmit} style={panelStyle}>
            <h2 style={panelTitleStyle}>Create Project</h2>

            <label style={fieldStyle}>
              <span className="label">Project Name</span>
              <input
                className="input"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Gravity Core"
                required
              />
            </label>

            <label style={fieldStyle}>
              <span className="label">Project Key</span>
              <input
                className="input"
                value={projectKey}
                onChange={(event) => setProjectKey(event.target.value.toUpperCase())}
                placeholder="GRA"
                maxLength={8}
                required
              />
            </label>

            <label style={fieldStyle}>
              <span className="label">Description</span>
              <textarea
                className="input"
                rows={4}
                value={projectDescription}
                onChange={(event) => setProjectDescription(event.target.value)}
                placeholder="Describe the project scope"
                style={{ resize: 'vertical' }}
              />
            </label>

            <button type="submit" className="btn btn-primary" disabled={pendingAction !== null}>
              {pendingAction === 'create' ? 'Creating...' : 'Create Project'}
            </button>
          </form>

          <form onSubmit={handleJoinSubmit} style={panelStyle}>
            <h2 style={panelTitleStyle}>Join by Invite</h2>

            <label style={fieldStyle}>
              <span className="label">Invite Code</span>
              <input
                className="input"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                placeholder="INV-GRA-1234"
                required
              />
            </label>

            <button type="submit" className="btn" disabled={pendingAction !== null}>
              {pendingAction === 'join' ? 'Joining...' : 'Join Project'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

const infoCardStyle: React.CSSProperties = {
  padding: '14px',
  borderRadius: '14px',
  border: '1px solid var(--border)',
  background: 'var(--sidebar-bg)',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  fontSize: '13px',
  color: 'var(--text-heading)',
};

const panelStyle: React.CSSProperties = {
  padding: '24px',
  borderRadius: '20px',
  border: '1px solid var(--border)',
  background: 'var(--card-bg)',
  display: 'grid',
  gap: '14px',
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: '18px',
  color: 'var(--text-heading)',
};

const fieldStyle: React.CSSProperties = {
  display: 'grid',
  gap: '6px',
};