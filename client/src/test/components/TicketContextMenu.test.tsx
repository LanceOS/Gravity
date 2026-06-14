import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TicketContextMenu } from '../../modules/tickets/components/TicketContextMenu';
import { TicketContext, type Ticket, type Project } from '../../context/TicketContext';

const ticket: Ticket = {
  id: 'ticket-1',
  key: 'GRA-1',
  title: 'Test ticket',
  status: 'todo',
  priority: 'low',
  projectId: 'project-1',
  assigneeId: null,
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

describe('TicketContextMenu', () => {
  it('filters projects by workspace for Move to Project', async () => {
    const user = userEvent.setup();
    const updateTicketMock = vi.fn();

    render(
      <TicketContext.Provider value={{
        projects: [project1, project2, projectOtherWorkspace],
        labels: [],
        cycles: [],
        users: [],
        updateTicket: updateTicketMock,
        deleteTicket: vi.fn(),
        assignLabelToTicket: vi.fn(),
        unassignLabelFromTicket: vi.fn(),
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
    expect(updateTicketMock).toHaveBeenCalledWith('ticket-1', { projectId: 'project-2' });
  });
});
