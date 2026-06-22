import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TicketContextMenu } from '../../modules/tickets/components/TicketContextMenu';
import type { Ticket, Project } from '../../context/TicketContextContext';
import { ProjectContext } from '../../context/project/ProjectContext';
import { TicketMutationContext } from '../../context/ticket/TicketMutationContext';
import { LabelContext } from '../../context/label/LabelContext';
import { CycleContext } from '../../context/cycle/CycleContext';
import { TicketListContext } from '../../context/ticket/TicketListContext';
import { UserDirectoryContext } from '../../context/user/UserDirectoryContext';
import { TicketRelationsContext } from '../../context/relation/TicketRelationsContext';

const ticket: Ticket = {
  id: 'ticket-1',
  key: 'GRA-1',
  title: 'Test ticket',
  description: '',
  status: 'todo',
  priority: 'low',
  projectId: 'project-1',
  assigneeId: null,
  cycleId: null,
  parentId: null,
  prStatus: 'none',
  prUrl: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
};

const project1: Project = {
  id: 'project-1',
  name: 'Gravity Core',
  key: 'GRA',
  description: '',
  status: 'active',
  workspaceId: 'workspace-1',
};

const project2: Project = {
  id: 'project-2',
  name: 'Orbit Delivery',
  key: 'ORB',
  description: '',
  status: 'active',
  workspaceId: 'workspace-1',
};

const projectOtherWorkspace: Project = {
  id: 'project-3',
  name: 'Other Workspace Project',
  key: 'OTH',
  description: '',
  status: 'active',
  workspaceId: 'workspace-2',
};

const dependencyTargetTicket: Ticket = {
  ...ticket,
  id: 'ticket-2',
  key: 'GRA-2',
  title: 'Dependency target ticket',
};

const blockerTargetTicket: Ticket = {
  ...ticket,
  id: 'ticket-3',
  key: 'GRA-3',
  title: 'Blocker target ticket',
};

function makeProjectContext(projects: Project[]) {
  const projectsByWorkspaceId = new Map<string, Project[]>();
  for (const project of projects) {
    const workspaceId = project.workspaceId || '';
    const workspaceProjects = projectsByWorkspaceId.get(workspaceId) || [];
    workspaceProjects.push(project);
    projectsByWorkspaceId.set(workspaceId, workspaceProjects);
  }

  return {
    projects,
    projectsLoading: false,
    projectLookup: new Map(),
    projectById: new Map(projects.map((project) => [project.id, project])),
    projectsByWorkspaceId,
    fetchInitialData: vi.fn(),
    fetchProjectData: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    joinProject: vi.fn(),
  };
}

describe('TicketContextMenu', () => {
  it('filters projects by workspace for Move to Project', async () => {
    const user = userEvent.setup();
    const updateTicketMock = vi.fn();
    const moveTicketMock = vi.fn();
    const deleteTicketMock = vi.fn();
    const addTicketDependencyMock = vi.fn().mockResolvedValue(true);
    const addTicketBlockerMock = vi.fn().mockResolvedValue(true);
    const projectContextValue = makeProjectContext([project1, project2, projectOtherWorkspace]);

    render(
      <TicketMutationContext.Provider value={{
        createTicket: vi.fn(),
        updateTicket: updateTicketMock,
        moveTicket: moveTicketMock,
        deleteTicket: deleteTicketMock,
      }}>
        <ProjectContext.Provider value={projectContextValue as any}>
          <TicketListContext.Provider value={{
            tickets: [ticket, dependencyTargetTicket, blockerTargetTicket],
            ticketMap: new Map(),
            isLoading: false,
          } as any}>
            <UserDirectoryContext.Provider value={{
              users: [],
              isLoading: false,
            } as any}>
              <TicketRelationsContext.Provider value={{
                activeTicketDetail: null,
                addTicketDependency: addTicketDependencyMock,
                addTicketBlocker: addTicketBlockerMock,
                removeTicketDependency: vi.fn(),
                removeTicketBlocker: vi.fn(),
              } as any}>
                <LabelContext.Provider value={{
                  labels: [],
                  globalLabels: [],
                  labelsByProject: new Map(),
                  assignLabelToTicket: vi.fn(),
                  unassignLabelFromTicket: vi.fn(),
                } as any}>
                  <CycleContext.Provider value={{
                    cycles: [],
                  } as any}>
                    <TicketContextMenu ticket={ticket}>
                      <div data-testid="ticket-trigger">Trigger Context Menu</div>
                    </TicketContextMenu>
                  </CycleContext.Provider>
                </LabelContext.Provider>
              </TicketRelationsContext.Provider>
            </UserDirectoryContext.Provider>
          </TicketListContext.Provider>
        </ProjectContext.Provider>
      </TicketMutationContext.Provider>
    );

    const triggerElement = screen.getByTestId('ticket-trigger');
    fireEvent.contextMenu(triggerElement);

    const moveToProjectOption = await screen.findByText('Move to Project');
    await user.hover(moveToProjectOption);

    // We should see project1 and project2 but not projectOtherWorkspace
    expect(await screen.findByText('Gravity Core')).toBeInTheDocument();
    expect(await screen.findByText('Orbit Delivery')).toBeInTheDocument();
    expect(screen.queryByText('Other Workspace Project')).not.toBeInTheDocument();

    await user.click(screen.getByText('Orbit Delivery'));
    expect(moveTicketMock).toHaveBeenCalledWith('ticket-1', 'project-1', 'project-2');
    expect(updateTicketMock).not.toHaveBeenCalledWith('ticket-1', { projectId: 'project-2' });
  });

  it('assigns the ticket as a dependency or blocker from the Assign As submenu', async () => {
    const user = userEvent.setup();
    const addTicketDependencyMock = vi.fn().mockResolvedValue(true);
    const addTicketBlockerMock = vi.fn().mockResolvedValue(true);
    const deleteTicketMock = vi.fn();
    const updateTicketMock = vi.fn();
    const moveTicketMock = vi.fn();
    const projectContextValue = makeProjectContext([project1]);
    const unrelatedProjectTicket: Ticket = {
      ...ticket,
      id: 'ticket-9',
      key: 'OTH-9',
      title: 'Unrelated project ticket',
      projectId: 'project-2',
    };

    render(
      <TicketMutationContext.Provider value={{
        createTicket: vi.fn(),
        updateTicket: updateTicketMock,
        moveTicket: moveTicketMock,
        deleteTicket: deleteTicketMock,
      }}>
        <ProjectContext.Provider value={projectContextValue as any}>
          <TicketListContext.Provider value={{
            tickets: [ticket, unrelatedProjectTicket],
            ticketMap: new Map(),
            isLoading: false,
          } as any}>
            <UserDirectoryContext.Provider value={{
              users: [],
              isLoading: false,
            } as any}>
              <TicketRelationsContext.Provider value={{
                activeTicketDetail: null,
                addTicketDependency: addTicketDependencyMock,
                addTicketBlocker: addTicketBlockerMock,
                removeTicketDependency: vi.fn(),
                removeTicketBlocker: vi.fn(),
              } as any}>
                <LabelContext.Provider value={{
                  labels: [],
                  globalLabels: [],
                  labelsByProject: new Map(),
                  assignLabelToTicket: vi.fn(),
                  unassignLabelFromTicket: vi.fn(),
                } as any}>
                  <CycleContext.Provider value={{
                    cycles: [],
                  } as any}>
                    <TicketContextMenu
                      ticket={ticket}
                      availableTickets={[ticket, dependencyTargetTicket, blockerTargetTicket]}
                    >
                      <div data-testid="ticket-trigger">Trigger Context Menu</div>
                    </TicketContextMenu>
                  </CycleContext.Provider>
                </LabelContext.Provider>
              </TicketRelationsContext.Provider>
            </UserDirectoryContext.Provider>
          </TicketListContext.Provider>
        </ProjectContext.Provider>
      </TicketMutationContext.Provider>
    );

    fireEvent.contextMenu(screen.getByTestId('ticket-trigger'));

    const assignAsItem = await screen.findByRole('menuitem', { name: 'Assign As' });
    await user.hover(assignAsItem);

    const dependencyItem = await screen.findByRole('menuitem', { name: 'Dependency' });
    await user.hover(dependencyItem);

    const dependencySearch = await screen.findByLabelText('Assign as Dependency');
    await user.type(dependencySearch, 'Dependency target');
    await user.click(await screen.findByRole('menuitem', { name: /GRA-2/ }));

    expect(addTicketDependencyMock).toHaveBeenCalledWith('ticket-1', 'ticket-2');
    expect(addTicketBlockerMock).not.toHaveBeenCalled();

    fireEvent.contextMenu(screen.getByTestId('ticket-trigger'));

    const assignAsItemAgain = await screen.findByRole('menuitem', { name: 'Assign As' });
    await user.hover(assignAsItemAgain);

    const blockerItem = await screen.findByRole('menuitem', { name: 'Blocker' });
    await user.hover(blockerItem);

    const blockerSearch = await screen.findByLabelText('Assign as Blocker');
    await user.type(blockerSearch, 'Blocker target');
    await user.click(await screen.findByRole('menuitem', { name: /GRA-3/ }));

    expect(addTicketBlockerMock).toHaveBeenCalledWith('ticket-1', 'ticket-3');
  });

  it('truncates long ticket titles inside the dependency and blocker popovers', async () => {
    const user = userEvent.setup();
    const longTitleTicket: Ticket = {
      ...ticket,
      id: 'ticket-10',
      key: 'GRA-10',
      title: 'Investigate intermittent synchronization backlog that should not expand the menu width',
    };
    const deleteTicketMock = vi.fn();
    const updateTicketMock = vi.fn();
    const moveTicketMock = vi.fn();
    const projectContextValue = makeProjectContext([project1]);

    render(
      <TicketMutationContext.Provider value={{
        createTicket: vi.fn(),
        updateTicket: updateTicketMock,
        moveTicket: moveTicketMock,
        deleteTicket: deleteTicketMock,
      }}>
        <ProjectContext.Provider value={projectContextValue as any}>
          <TicketListContext.Provider value={{
            tickets: [ticket, longTitleTicket],
            ticketMap: new Map(),
            isLoading: false,
          } as any}>
            <UserDirectoryContext.Provider value={{
              users: [],
              isLoading: false,
            } as any}>
              <TicketRelationsContext.Provider value={{
                activeTicketDetail: null,
                addTicketDependency: vi.fn().mockResolvedValue(true),
                addTicketBlocker: vi.fn().mockResolvedValue(true),
                removeTicketDependency: vi.fn(),
                removeTicketBlocker: vi.fn(),
              } as any}>
                <LabelContext.Provider value={{
                  labels: [],
                  globalLabels: [],
                  labelsByProject: new Map(),
                  assignLabelToTicket: vi.fn(),
                  unassignLabelFromTicket: vi.fn(),
                } as any}>
                  <CycleContext.Provider value={{
                    cycles: [],
                  } as any}>
                    <TicketContextMenu
                      ticket={ticket}
                      availableTickets={[ticket, longTitleTicket]}
                    >
                      <div data-testid="ticket-trigger">Trigger Context Menu</div>
                    </TicketContextMenu>
                  </CycleContext.Provider>
                </LabelContext.Provider>
              </TicketRelationsContext.Provider>
            </UserDirectoryContext.Provider>
          </TicketListContext.Provider>
        </ProjectContext.Provider>
      </TicketMutationContext.Provider>
    );

    fireEvent.contextMenu(screen.getByTestId('ticket-trigger'));

    const assignAsItem = await screen.findByRole('menuitem', { name: 'Assign As' });
    await user.hover(assignAsItem);

    const dependencyItem = await screen.findByRole('menuitem', { name: 'Dependency' });
    await user.hover(dependencyItem);

    const dependencySearch = await screen.findByLabelText('Assign as Dependency');
    await user.type(dependencySearch, 'Investigate');

    const titleRow = await screen.findByText(longTitleTicket.title);
    expect(titleRow).toHaveStyle({
      display: 'block',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
  });

  it('renders children unchanged when the mutation provider is absent', () => {
    render(
      <ProjectContext.Provider value={makeProjectContext([project1]) as any}>
        <TicketListContext.Provider value={{
          tickets: [ticket],
          ticketMap: new Map(),
          isLoading: false,
        } as any}>
          <UserDirectoryContext.Provider value={{
            users: [],
            isLoading: false,
          } as any}>
            <TicketRelationsContext.Provider value={{
              activeTicketDetail: null,
              addTicketDependency: vi.fn(),
              addTicketBlocker: vi.fn(),
              removeTicketDependency: vi.fn(),
              removeTicketBlocker: vi.fn(),
            } as any}>
              <TicketContextMenu ticket={ticket}>
                <div data-testid="ticket-trigger">Trigger Context Menu</div>
              </TicketContextMenu>
            </TicketRelationsContext.Provider>
          </UserDirectoryContext.Provider>
        </TicketListContext.Provider>
      </ProjectContext.Provider>
    );

    expect(screen.getByTestId('ticket-trigger')).toBeInTheDocument();
  });
});
