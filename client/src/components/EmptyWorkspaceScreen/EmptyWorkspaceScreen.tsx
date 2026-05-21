import React, { useState } from 'react';
import { FolderPlus, LogOut, Sparkles, Ticket, Users } from 'lucide-react';
import type { EmptyWorkspaceScreenProps } from './types';
import { normalizeInviteCode, normalizeProjectKey } from './utils';
import { TextInput, Textarea } from '@library';

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

            <TextInput
              label="Project Name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Gravity Core"
              required
            />

            <TextInput
              label="Project Key"
              value={projectKey}
              onChange={(event) => setProjectKey(normalizeProjectKey(event.target.value))}
              placeholder="GRA"
              maxLength={8}
              required
            />

            <Textarea
              label="Description"
              rows={4}
              value={projectDescription}
              onChange={(event) => setProjectDescription(event.target.value)}
              placeholder="Describe the project scope"
              style={{ resize: 'vertical' }}
            />

            <button type="submit" className="btn btn-primary" disabled={pendingAction !== null}>
              {pendingAction === 'create' ? 'Creating...' : 'Create Project'}
            </button>
          </form>

          <form onSubmit={handleJoinSubmit} style={panelStyle}>
            <h2 style={panelTitleStyle}>Join by Invite</h2>

            <TextInput
              label="Invite Code"
              value={inviteCode}
              onChange={(event) => setInviteCode(normalizeInviteCode(event.target.value))}
              placeholder="INV-GRA-1234"
              required
            />

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