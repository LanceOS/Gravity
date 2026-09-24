import '../../../library/styles/library.css';
import '../../src/index.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { applyThemePreference } from '../../../library/utilities/themeEngine';
import { WorkspaceLayout } from '../../src/layouts/WorkspaceLayout/WorkspaceLayout';
import type { SidebarProps } from '../../src/components/Sidebar/types';

const params = new URLSearchParams(location.search);
applyThemePreference(params.get('theme') === 'light' ? 'marble-blue' : 'dark', { persist: false });
const noop = () => {};
const user = { id: 'user', name: 'Casey Carter', email: 'casey@example.com', role: 'owner',
  avatar: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="28" height="28"%3E%3Ccircle cx="14" cy="14" r="14" fill="%23888"/%3E%3C/svg%3E' };
const project = { id: 'project', name: 'Gravity Core', description: '', key: 'GRA', status: 'active', workspaceId: 'workspace' };
const cycle = { id: 'cycle', name: 'Sprint 1', startDate: '', endDate: '', completed: 0 };
const label = { id: 'label', name: 'Design', color: '#32a881', projectId: 'project' };

export function Fixture() {
  const [context, setContext] = useState<'issues' | 'notes'>('notes');
  const [selectedLabel, setSelectedLabel] = useState(true);
  const teams = params.get('view') === 'teams';
  const props: SidebarProps = {
    workspace: { workspaces: [{ id: 'workspace', name: 'Gravity' }], activeWorkspaceId: 'workspace', onSelectWorkspace: noop, onOpenWorkspaceDirectory: noop },
    projects: {
      hierarchyMode: teams ? 'teams' : 'flat', projects: [project], cycles: [cycle], labels: [label],
      teams: [{ id: 'team', name: 'Engineering', description: '', color: '#5091d7', projects: [project],
        views: [{ id: 'all', name: 'All Tasks', type: 'all' }], cycles: [cycle], labels: [label] }],
      currentUser: user, activeProjectId: teams ? '' : 'project', activeTeamId: teams ? 'team' : '',
      activeContext: context,
      filters: { status: '', priority: '', projectId: 'project', labels: selectedLabel ? ['label'] : [], cycleId: '', assigneeId: '', search: '' },
      counts: { myIssues: 2, activeProjectIssues: 12, cycles: {}, labels: { label: 3 } },
      onSelectProject: noop, onSelectTeam: noop, onShowProjectIssues: () => { setContext('issues'); setSelectedLabel(false); },
      onShowMyIssues: noop, onShowNotes: () => setContext('notes'), onSelectLabel: () => setSelectedLabel(!selectedLabel),
      onSelectWorkspaceAllTasks: noop, onSelectWorkspaceProjects: noop,
    },
    tools: { onOpenAgent: noop, onOpenSimulator: noop, onOpenCreateTicket: noop },
    userMenu: { currentUser: user, activeArea: 'account', onOpenWorkspaceDirectory: noop,
      onOpenAccountPreferences: noop, onOpenProjectManager: noop, onOpenSettings: noop, onSignOut: noop },
  };
  return <WorkspaceLayout sidebarProps={props} isMobile={params.get('mode') === 'mobile'}>
    <p>Current view: {context}</p>
  </WorkspaceLayout>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
