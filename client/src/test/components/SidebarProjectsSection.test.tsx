import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SidebarProjectsSection } from '../../components/Sidebar/components/SidebarProjectsSection.tsx';

function makeProps(overrides = {}) {
  const props = {
    section: {
      projects: [
        { id: 'project-1', name: 'Proj 1', description: '', key: 'P1', status: 'active', workspaceId: 'w1' },
      ],
      labels: [
        { id: 'd-1', name: 'Label One', color: '#ff0000' },
        { id: 'd-2', name: 'Label Two', color: '#00ff00' },
      ],
      cycles: [],
      currentUser: { id: 'user-1', name: 'A', email: 'a@b', avatar: '', role: 'owner' },
      activeProjectId: 'project-1',
      filters: { status: '', priority: '', projectId: '', labels: [] as string[], cycleId: '', assigneeId: '', search: '' },
      counts: { myIssues: 0, activeProjectIssues: 0, labels: { 'd-1': 1, 'd-2': 2 }, cycles: {} },
      onSelectProject: vi.fn(),
      onShowProjectIssues: vi.fn(),
      onShowMyIssues: vi.fn(),
      onSelectCycle: vi.fn(),
      onSelectLabel: vi.fn(),
    },
    projectsCollapsed: false,
    collapsedProjects: {},
    collapsedTeamProjects: {},
    onToggleProjectsCollapsed: vi.fn(),
    onToggleProject: vi.fn(),
    onToggleTeamProjects: vi.fn(),
    ...overrides,
  };

  return props;
}

describe('SidebarProjectsSection', () => {
  it('calls onSelectLabel when a label is clicked', async () => {
    const user = userEvent.setup();
    const props = makeProps();

    render(
      // @ts-expect-error narrow props for test
      <SidebarProjectsSection {...props} />
    );

    await user.click(screen.getByRole('button', { name: /Label One/i }));

    expect(props.section.onSelectLabel).toHaveBeenCalledWith('d-1');
  });

  it('renders teams as primary navigation with scoped tabs and collapsible projects', async () => {
    const user = userEvent.setup();
    const onSelectWorkspaceAllTasks = vi.fn();
    const props = makeProps({
      section: {
        ...makeProps().section,
        hierarchyMode: 'teams',
        navigationState: {
          activeTeam: 'team-1',
          activeScope: 'views',
          activeProject: '',
        },
        activeViewId: 'all',
        activeTeamId: 'team-1',
        activeCycleId: '',
        activeDomainId: '',
        teams: [
          {
            id: 'team-1',
            name: 'Platform',
            description: '',
            color: '#3b82f6',
            views: [{ id: 'all', name: 'All Tasks', type: 'all' }],
            cycles: [{ id: 'cycle-1', name: 'Sprint 1', startDate: '', endDate: '', completed: 0 }],
            domains: [{ id: 'domain-1', name: 'API', color: '#22c55e' }],
            projects: [
              { id: 'project-1', name: 'Proj 1', description: '', key: 'P1', status: 'active', workspaceId: 'w1' },
            ],
          },
        ],
        onSelectWorkspaceAllTasks,
        onSelectTeam: vi.fn(),
        onSelectAllTasks: vi.fn(),
        onSelectCycle: vi.fn(),
        onSelectDomain: vi.fn(),
        onSelectProject: vi.fn(),
      },
    });

    const { rerender } = render(
      // @ts-expect-error narrow props for test
      <SidebarProjectsSection {...props} />
    );

    await user.click(screen.getAllByRole('button', { name: /^All Tasks$/i })[0]);
    expect(onSelectWorkspaceAllTasks).toHaveBeenCalledTimes(1);

    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('Views')).toBeInTheDocument();
    expect(screen.getByText('Cycles')).toBeInTheDocument();
    expect(screen.getByText('Domains')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Projects/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Proj 1/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Projects/i }));
    expect(props.onToggleTeamProjects).toHaveBeenCalledWith('team-1');

    rerender(
      // @ts-expect-error narrow props for test
      <SidebarProjectsSection {...props} collapsedTeamProjects={{ 'team-1': true }} />
    );

    expect(screen.queryByRole('button', { name: /Proj 1/i })).not.toBeInTheDocument();
  });
});
