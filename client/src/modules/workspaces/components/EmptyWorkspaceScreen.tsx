import React, { useState } from 'react';
import { FolderPlus, LogOut, Sparkles, Ticket, Users } from 'lucide-react';
import type { EmptyWorkspaceScreenProps } from '../types/EmptyWorkspaceScreen';
import { normalizeInviteCode, normalizeProjectKey } from '../utils/EmptyWorkspaceScreen';
import { TextInput, Textarea } from '@library';
import './EmptyWorkspaceScreen.css';

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

  const handleCreateSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onCreateProject({
      name: projectName,
      key: projectKey,
      description: projectDescription,
    });
  };

  const handleJoinSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onJoinProject(inviteCode);
  };

  return (
    <div className="empty-workspace">
      <div className="empty-workspace__layout">
        <section className="empty-workspace__welcome">
          <div className="empty-workspace__intro">
            <div className="empty-workspace__mark">
              <Sparkles size={24} color="var(--color-primary)" />
            </div>

            <div>
              <h1 className="empty-workspace__title">
                Welcome, {currentUser.name}
              </h1>
              <p className="empty-workspace__description">
                Your workspace is empty. Create your first project or join an existing one by invite.
              </p>
            </div>
          </div>

          <div className="empty-workspace__features">
            <div className="empty-workspace__feature">
              <FolderPlus size={18} color="var(--color-primary)" />
              <span>Create the first project space</span>
            </div>
            <div className="empty-workspace__feature">
              <Users size={18} color="var(--color-primary)" />
              <span>Join teammates by invite code</span>
            </div>
            <div className="empty-workspace__feature">
              <Ticket size={18} color="var(--color-primary)" />
              <span>Add tickets after the project exists</span>
            </div>
          </div>

          {errorMessage && (
            <div className="empty-workspace__error" role="alert">
              {errorMessage}
            </div>
          )}

          <button
            type="button"
            onClick={onSignOut}
            className="btn empty-workspace__sign-out"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </section>

        <section className="empty-workspace__forms">
          <form onSubmit={handleCreateSubmit} className="empty-workspace__panel">
            <h2 className="empty-workspace__panel-title">Create Project</h2>

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

          <form onSubmit={handleJoinSubmit} className="empty-workspace__panel">
            <h2 className="empty-workspace__panel-title">Join by Invite</h2>

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
