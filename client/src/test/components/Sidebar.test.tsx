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
  onToggleProjectsCollapsed: () => void;
  onToggleProject: (projectId: string) => void;
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
    onToggleProjectsCollapsed,
    onToggleProject,
  }: SidebarProjectsSectionMockProps) => (
    <div>
      <div>{`ProjectsCollapsed ${String(projectsCollapsed)}`}</div>
      <div>{`CurrentProjectCollapsed ${String(collapsedProjects[section.activeProjectId] ?? false)}`}</div>
      <div>{`OtherProjectCollapsed ${String(collapsedProjects['project-2'] ?? 'unset')}`}</div>
      <button type="button" onClick={onToggleProjectsCollapsed}>
        Toggle project list
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
      domains: [],
      cycles: [],
      currentUser: {
        id: 'user-1',
        name: 'Casey Carter',
        email: 'casey@example.com',
        avatar: '',
        role: 'owner',
      },
      activeProjectId: 'project-1',
      filters: {
        status: '',
        priority: '',
        projectId: '',
        domainId: '',
        cycleId: '',
        assigneeId: '',
        search: '',
      },
      counts: {
        myIssues: 1,
        activeProjectIssues: 2,
        domains: {},
        cycles: {},
      },
      onSelectProject: vi.fn(),
      onShowProjectIssues: vi.fn(),
      onShowMyIssues: vi.fn(),
      onSelectCycle: vi.fn(),
      onSelectDomain: vi.fn(),
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

    await user.click(screen.getByRole('button', { name: 'Toggle current project' }));
    expect(screen.getByText('CurrentProjectCollapsed true')).toBeInTheDocument();

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
});