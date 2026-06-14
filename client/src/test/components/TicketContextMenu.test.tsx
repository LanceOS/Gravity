import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TicketContextMenu } from '../../modules/tickets/components/TicketContextMenu';
import { TicketContext, type Ticket, type Project } from '../../context/TicketContext';

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

describe('TicketContextMenu', () => {
  it('filters projects by workspace for Move to Project', async () => {
    const user = userEvent.setup();
    const updateTicketMock = vi.fn();
    const moveTicketMock = vi.fn();
    const addTicketDependencyMock = vi.fn().mockResolvedValue(true);
    const addTicketBlockerMock = vi.fn().mockResolvedValue(true);

    render(
      <TicketContext.Provider value={{
        tickets: [ticket, dependencyTargetTicket, blockerTargetTicket],
        projects: [project1, project2, projectOtherWorkspace],
        labels: [],
        cycles: [],
        users: [],
        updateTicket: updateTicketMock,
        moveTicket: moveTicketMock,
        deleteTicket: vi.fn(),
        addTicketDependency: addTicketDependencyMock,
        addTicketBlocker: addTicketBlockerMock,
        assignLabelToTicket: vi.fn(),
        unassignLabelFromTicket: vi.fn(),
        removeTicketDependency: vi.fn(),
        removeTicketBlocker: vi.fn(),
      } as any}>
        <TicketContextMenu ticket={ticket}>
          <div data-testid="ticket-trigger">Trigger Context Menu</div>
        </TicketContextMenu>
      </TicketContext.Provider>
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
    const unrelatedProjectTicket: Ticket = {
      ...ticket,
      id: 'ticket-9',
      key: 'OTH-9',
      title: 'Unrelated project ticket',
      projectId: 'project-2',
    };

    render(
      <TicketContext.Provider value={{
        tickets: [ticket, unrelatedProjectTicket],
        projects: [project1],
        labels: [],
        cycles: [],
        users: [],
        updateTicket: vi.fn(),
        moveTicket: vi.fn(),
        deleteTicket: vi.fn(),
        addTicketDependency: addTicketDependencyMock,
        addTicketBlocker: addTicketBlockerMock,
        assignLabelToTicket: vi.fn(),
        unassignLabelFromTicket: vi.fn(),
        removeTicketDependency: vi.fn(),
        removeTicketBlocker: vi.fn(),
      } as any}>
        <TicketContextMenu
          ticket={ticket}
          availableTickets={[ticket, dependencyTargetTicket, blockerTargetTicket]}
        >
          <div data-testid="ticket-trigger">Trigger Context Menu</div>
        </TicketContextMenu>
      </TicketContext.Provider>
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
});
