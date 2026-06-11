import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TeamsSidebar } from '../../components/Sidebar/teams/TeamsSidebar.tsx';
import type { SidebarProjectSection } from '../../components/Sidebar/types';

function buildSection(overrides: Partial<SidebarProjectSection> = {}): SidebarProjectSection {
  return {
    hierarchyMode: 'teams',
    teams: [
      {
        id: 'team-1',
        name: 'Engineering',
        description: 'Primary team',
        color: '#3B82F6',
        views: [
          { id: 'all', name: 'All Tasks', type: 'all' },
          { id: 'timeline', name: 'Timeline', type: 'timeline' },
        ],
        cycles: [],
        domains: [],
        projects: [
          {
            id: 'project-1',
            name: 'Gravity Core',
            description: '',
            key: 'GRA',
            status: 'active',
            workspaceId: 'workspace-1',
          },
        ],
      },
    ],
    navigationState: {
      activeTeam: 'team-1',
      activeScope: 'views',
      activeProject: '',
    },
    activeTeamId: 'team-1',
    activeViewId: 'all',
    activeCycleId: '',
    activeDomainId: '',
    onSelectWorkspaceAllTasks: vi.fn(),
    onSelectTeam: vi.fn(),
    onSelectView: vi.fn(),
    onSelectCycle: vi.fn(),
    onSelectDomain: vi.fn(),
    onSelectAllTasks: vi.fn(),
    projects: [],
    labels: [],
    domains: [],
    cycles: [],
    currentUser: {
      id: 'user-1',
      name: 'Casey Carter',
      email: 'casey@example.com',
      avatar: '',
      role: 'owner',
    },
    activeProjectId: '',
    filters: {
      status: '',
      priority: '',
      projectId: '',
      domainId: '',
      labels: [],
      labelMode: 'any',
      cycleId: '',
      assigneeId: '',
      search: '',
    },
    counts: {
      myIssues: 0,
      activeProjectIssues: 0,
      cycles: {},
    },
    onSelectProject: vi.fn(),
    onShowProjectIssues: vi.fn(),
    onShowMyIssues: vi.fn(),
    onShowNotes: vi.fn(),
    ...overrides,
  };
}

function TeamsSidebarHarness() {
  const [teamsCollapsed, setTeamsCollapsed] = useState(false);
  const section = buildSection();

  return (
    <TeamsSidebar
      section={section}
      teamsCollapsed={teamsCollapsed}
      collapsedTeamProjects={{}}
      onToggleTeamProjects={vi.fn()}
      onToggleTeamsCollapsed={() => setTeamsCollapsed((current) => !current)}
    />
  );
}

describe('TeamsSidebar', () => {
  it('collapses and expands the teams list', async () => {
    const user = userEvent.setup();

    render(<TeamsSidebarHarness />);

    const teamsToggle = screen.getByRole('button', { name: 'Teams' });
    expect(teamsToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Engineering')).toBeInTheDocument();

    await user.click(teamsToggle);

    expect(teamsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Engineering')).not.toBeInTheDocument();

    await user.click(teamsToggle);

    expect(teamsToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Engineering')).toBeInTheDocument();
  });
});
