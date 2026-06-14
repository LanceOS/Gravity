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
        labels: [],
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
    activeLabelId: '',
    onSelectWorkspaceAllTasks: vi.fn(),
    onSelectWorkspaceProjects: vi.fn(),
    onSelectTeam: vi.fn(),
    onSelectView: vi.fn(),
    onSelectCycle: vi.fn(),
    onSelectTeamLabel: vi.fn(),
    onSelectAllTasks: vi.fn(),
    projects: [],
    labels: [],
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
      labelId: '',
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
  const [activeTeamId, setActiveTeamId] = useState('team-1');
  const [collapsedTeams, setCollapsedTeams] = useState<Record<string, boolean>>({});
  const section = buildSection({ activeTeamId });

  return (
    <TeamsSidebar
      section={section}
      collapsedTeams={collapsedTeams}
      collapsedTeamProjects={{}}
      onToggleTeam={(teamId) => {
        if (teamId !== activeTeamId) {
          setActiveTeamId(teamId);
          setCollapsedTeams((current) => ({ ...current, [teamId]: false }));
          return;
        }

        setCollapsedTeams((current) => ({ ...current, [teamId]: !current[teamId] }));
      }}
      onToggleTeamProjects={vi.fn()}
    />
  );
}

describe('TeamsSidebar', () => {
  it('collapses and expands an individual team row', async () => {
    const user = userEvent.setup();

    render(<TeamsSidebarHarness />);

    const engineeringToggle = screen.getByRole('button', { name: 'Engineering' });
    expect(screen.getByText('Timeline')).toBeInTheDocument();

    await user.click(engineeringToggle);

    expect(screen.getByText('Timeline')).not.toBeVisible();

    await user.click(engineeringToggle);

    expect(screen.getByText('Timeline')).toBeVisible();
  });

  it('opens the workspace projects list when the workspace Projects tab is clicked', async () => {
    const user = userEvent.setup();
    const onSelectWorkspaceProjects = vi.fn();

    render(
      <TeamsSidebar
        section={buildSection({ onSelectWorkspaceProjects })}
        collapsedTeams={{}}
        collapsedTeamProjects={{}}
        onToggleTeam={vi.fn()}
        onToggleTeamProjects={vi.fn()}
      />
    );

    await user.click(screen.getAllByRole('button', { name: 'Projects' })[0]);

    expect(onSelectWorkspaceProjects).toHaveBeenCalledTimes(1);
  });
});
