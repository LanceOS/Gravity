import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IndividualsSidebar } from '../../components/Sidebar/individuals/IndividualsSidebar';
import { TeamsSidebar } from '../../components/Sidebar/teams/TeamsSidebar';
import type { SidebarProjectSection } from '../../components/Sidebar/types';

function buildCommonProjectSection(): SidebarProjectSection {
  return {
    projects: [
      {
        id: 'project-1',
        name: 'Gravity Core',
        description: 'Primary project',
        key: 'GRA',
        status: 'active',
        workspaceId: 'workspace-1',
      },
    ],
    labels: [],
    cycles: [],
    currentUser: {
      id: 'user-1',
      name: 'Casey Carter',
      email: 'casey@example.com',
      avatar: '',
      role: 'owner',
    },
    activeProjectId: 'project-1',
    activeTeamId: '',
    filters: {
      status: '',
      priority: '',
      projectId: '',
      labelId: '',
      cycleId: '',
      assigneeId: '',
      search: '',
    },
    counts: {
      myIssues: 0,
      activeProjectIssues: 0,
      labels: {},
      cycles: {},
    },
    onSelectProject: vi.fn(),
    onShowProjectIssues: vi.fn(),
    onShowMyIssues: vi.fn(),
    onShowNotes: vi.fn(),
    onSelectCycleLegacy: vi.fn(),
    onSelectLabel: vi.fn(),
    onSelectWorkspaceAllTasks: vi.fn(),
    onSelectWorkspaceProjects: vi.fn(),
    onSelectWorkspaceChat: vi.fn(),
  };
}

describe('Sidebar workspace chat entry', () => {
  it('renders AI Chat in the workspace section for flat workspaces', async () => {
    const user = userEvent.setup();
    const onSelectWorkspaceChat = vi.fn();

    render(
      <IndividualsSidebar
        section={{
          ...buildCommonProjectSection(),
          onSelectWorkspaceChat,
        }}
        onToggleProject={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'AI Chat' }));
    expect(onSelectWorkspaceChat).toHaveBeenCalledTimes(1);
  });

  it('renders AI Chat in the workspace section for team workspaces', async () => {
    const user = userEvent.setup();
    const onSelectWorkspaceChat = vi.fn();

    render(
      <TeamsSidebar
        section={{
          ...buildCommonProjectSection(),
          hierarchyMode: 'teams',
          teams: [],
          onSelectWorkspaceChat,
        }}
        onToggleTeam={vi.fn()}
        onToggleTeamProjects={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'AI Chat' }));
    expect(onSelectWorkspaceChat).toHaveBeenCalledTimes(1);
  });
});
