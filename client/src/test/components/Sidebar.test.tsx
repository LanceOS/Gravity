import type { RefObject } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from '../../components/Sidebar/Sidebar.tsx';
import type { SidebarProps } from '../../components/Sidebar/types';

type SidebarHeaderMockProps = {
  workspace: SidebarProps['workspace'];
  onOpenCreateTicket: () => void;
};

type SidebarProjectsSectionMockProps = {
  section: SidebarProps['projects'];
  projectsCollapsed: boolean;
  collapsedProjects: Record<string, boolean>;
  collapsedTeams: Record<string, boolean>;
  onToggleProjectsCollapsed: () => void;
  onToggleProject: (projectId: string) => void;
  onToggleTeam: (teamId: string) => void;
};

type SidebarAgentToolsMockProps = {
  tools: SidebarProps['tools'];
};

type SidebarUserMenuMockProps = {
  userMenu: SidebarProps['userMenu'];
  showUserDropdown: boolean;
  onToggleUserDropdown: () => void;
  onCloseUserDropdown: () => void;
  profileRef: RefObject<HTMLDivElement | null>;
};

vi.mock('../../components/Sidebar/components', () => ({

  SidebarProjectsSection: ({
    section,
    projectsCollapsed,
    collapsedProjects,
    collapsedTeams,
    onToggleProjectsCollapsed,
    onToggleProject,
    onToggleTeam,
  }: SidebarProjectsSectionMockProps) => (
    <div>
      <div>{`ProjectsCollapsed ${String(projectsCollapsed)}`}</div>
      <div>{`CurrentTeamCollapsed ${String(collapsedTeams[section.activeTeamId ?? 'team-1'] ?? false)}`}</div>
      <div>{`OtherTeamCollapsed ${String(collapsedTeams['team-2'] ?? 'unset')}`}</div>
      <div>{`CurrentProjectCollapsed ${String(collapsedProjects[section.activeProjectId] ?? false)}`}</div>
      <div>{`OtherProjectCollapsed ${String(collapsedProjects['project-2'] ?? 'unset')}`}</div>
      <button type="button" onClick={onToggleProjectsCollapsed}>
        Toggle project list
      </button>
      <button type="button" onClick={() => onToggleTeam(section.activeTeamId ?? 'team-1')}>
        Toggle current team
      </button>
      <button type="button" onClick={() => onToggleTeam('team-2')}>
        Select other team
      </button>
      <button type="button" onClick={() => onToggleProject(section.activeProjectId)}>
        Toggle current project
      </button>
      <button type="button" onClick={() => onToggleProject('project-2')}>
        Select other project
      </button>
    </div>
  ),
  SidebarAgentTools: ({ tools }: SidebarAgentToolsMockProps) => (
    <div>
      <button type="button" onClick={tools.onOpenSimulator}>
        Open simulator
      </button>
    </div>
  ),
  SidebarUserMenu: ({
    userMenu,
    showUserDropdown,
    onToggleUserDropdown,
    onCloseUserDropdown,
    profileRef,
  }: SidebarUserMenuMockProps) => (
    <div ref={profileRef}>
      <div>{`UserDropdown ${showUserDropdown ? 'open' : 'closed'}`}</div>
      <button type="button" onClick={onToggleUserDropdown}>
        Toggle user dropdown
      </button>
      <button type="button" onClick={onCloseUserDropdown}>
        Close user dropdown
      </button>
      <button type="button" onClick={userMenu.onOpenSettings}>
        Open settings
      </button>
      <div>Inside profile</div>
    </div>
  ),
}));

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  const props: SidebarProps = {
    workspace: {
      workspaces: [{ id: 'workspace-1', name: 'Gravity' }],
      activeWorkspaceId: 'workspace-1',
      onSelectWorkspace: vi.fn(),
      onOpenWorkspaceDirectory: vi.fn(),
    },
    projects: {
      projects: [
        {
          id: 'project-1',
          name: 'Gravity Core',
          description: 'Primary project',
          key: 'GRA',
          status: 'active',
          workspaceId: 'workspace-1',
        },
        {
          id: 'project-2',
          name: 'Orbit Delivery',
          description: 'Partner project',
          key: 'ORB',
          status: 'planned',
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
      activeTeamId: 'team-1',
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
        myIssues: 1,
        activeProjectIssues: 2,
        labels: {},
        cycles: {},
      },
      onSelectProject: vi.fn(),
      onSelectTeam: vi.fn(),
      onShowProjectIssues: vi.fn(),
      onShowMyIssues: vi.fn(),
      onShowNotes: vi.fn(),
      onSelectCycle: vi.fn(),
      onSelectTeamLabel: vi.fn(),
    },
    tools: {
      onOpenOllama: vi.fn(),
      onOpenSimulator: vi.fn(),
      onOpenCreateTicket: vi.fn(),
    },
    userMenu: {
      currentUser: {
        id: 'user-1',
        name: 'Casey Carter',
        email: 'casey@example.com',
        avatar: '',
        role: 'owner',
      },
      activeArea: 'workspace',
      onOpenWorkspaceDirectory: vi.fn(),
      onOpenAccountPreferences: vi.fn(),
      onOpenProjectManager: vi.fn(),
      onOpenSettings: vi.fn(),
      onOpenMcp: vi.fn(),
      onSignOut: vi.fn(),
    },
    ...overrides,
  };

  return {
    ...render(<Sidebar {...props} />),
    props,
  };
}

describe('Sidebar', () => {
  it('toggles project sections and forwards create-ticket and selection actions', async () => {
    const user = userEvent.setup();
    const { props } = renderSidebar();

    await user.click(screen.getByRole('button', { name: /new ticket/i }));
    expect(props.tools.onOpenCreateTicket).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Toggle project list' }));
    expect(screen.getByText('ProjectsCollapsed true')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Toggle current team' }));
    expect(screen.getByText('CurrentTeamCollapsed true')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Toggle current project' }));
    expect(screen.getByText('CurrentProjectCollapsed true')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Select other team' }));
    expect(props.projects.onSelectTeam).toHaveBeenCalledWith('team-2');
    expect(screen.getByText('OtherTeamCollapsed false')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Select other project' }));
    expect(props.projects.onSelectProject).toHaveBeenCalledWith('project-2');
    expect(screen.getByText('OtherProjectCollapsed false')).toBeInTheDocument();
  });

  it('keeps the user dropdown open for inside clicks and closes it outside the profile ref', async () => {
    const user = userEvent.setup();
    const { props } = renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Toggle user dropdown' }));
    expect(screen.getByText('UserDropdown open')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('Inside profile'));
    expect(screen.getByText('UserDropdown open')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(props.userMenu.onOpenSettings).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(document.body);
    expect(screen.getByText('UserDropdown closed')).toBeInTheDocument();
  });

  it('renders flat workspace context menu and hides New Team', async () => {
    const user = userEvent.setup();
    const { props, rerender, container } = renderSidebar();
    
    rerender(<Sidebar {...props} projects={{ ...props.projects, hierarchyMode: 'flat', onOpenCreateTeam: vi.fn() }} />);

    const triggerElement = screen.getByRole('button', { name: 'Toggle project list' });
    fireEvent.contextMenu(triggerElement);
    
    // Check context menu opens
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    
    // "New Team" should not be rendered
    expect(screen.queryByText('New Team')).not.toBeInTheDocument();
  });

  it('renders teams workspace context menu and shows New Team', async () => {
    const user = userEvent.setup();
    const onOpenCreateTeamMock = vi.fn();
    const { props, rerender, container } = renderSidebar();

    rerender(<Sidebar {...props} projects={{ ...props.projects, hierarchyMode: 'teams', onOpenCreateTeam: onOpenCreateTeamMock }} />);

    const triggerElement = screen.getByRole('button', { name: 'Toggle project list' });
    fireEvent.contextMenu(triggerElement);
    
    const newTeamOption = await screen.findByText('New Team');
    expect(newTeamOption).toBeInTheDocument();

    await user.click(newTeamOption);
    expect(onOpenCreateTeamMock).toHaveBeenCalledTimes(1);
  });
});
