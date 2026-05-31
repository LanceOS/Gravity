import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { dbState } from './setup';

describe('Sub-ticket navigation E2E', () => {
  it('navigates from parent ticket to sub-ticket and back via parent reference', async () => {
    const user = userEvent.setup();

    // Seed mock DB
    dbState.currentUser = { id: 'usr-1', name: 'E2E User', email: 'e2e@gravity.test' } as any;
    const workspace = { id: 'wsp-1', name: 'E2E Workspace', defaultProjectId: 'prj-1', role: 'owner' };
    const project = { id: 'prj-1', workspaceId: 'wsp-1', name: 'E2E Project', key: 'TST' };
    dbState.workspaces.push(workspace);
    dbState.projects.push(project);

    const parentTicket = {
      id: 'tkt-parent',
      key: 'TST-1',
      title: 'Parent Ticket Title',
      description: 'Parent description',
      status: 'todo',
      priority: 'medium',
      projectId: project.id,
      domainId: null,
      cycleId: null,
      assigneeId: null,
      parentId: null,
      createdAt: new Date().toISOString(),
      prStatus: 'none',
      prUrl: null,
    };

    const childTicket = {
      id: 'tkt-child',
      key: 'TST-2',
      title: 'Child Ticket Title',
      description: 'Child description',
      status: 'todo',
      priority: 'medium',
      projectId: project.id,
      domainId: null,
      cycleId: null,
      assigneeId: null,
      parentId: parentTicket.id,
      createdAt: new Date().toISOString(),
      prStatus: 'none',
      prUrl: null,
    };

    dbState.tickets.push(parentTicket, childTicket);

    // Render the full App
    render(<App />);

    // Parent ticket should appear on the board/list
    const parentCard = await screen.findByText(parentTicket.title);
    expect(parentCard).toBeInTheDocument();

    // Open parent ticket detail
    await user.click(parentCard);

    // Subtask (child) should be visible in the parent detail and clickable
    const detailContainer = document.querySelector('.workspace-page__detail');
    expect(detailContainer).toBeTruthy();
    const matches = within(detailContainer as Element).getAllByText(childTicket.title);
    const clickableMatch = matches.find((el) => el.closest('.clickable')) || matches[0];
    expect(clickableMatch).toBeTruthy();
    await user.click(clickableMatch as Element);

    // The parent reference button should be present in the child detail
    const parentBtn = await screen.findByRole('button', { name: `${parentTicket.key} - ${parentTicket.title}` });
    expect(parentBtn).toBeInTheDocument();

    // Click the parent reference to navigate back to the parent
    await user.click(parentBtn);

    // Parent detail should be visible again (verify by parent key)
    await waitFor(() => {
      expect(screen.getByText(parentTicket.key)).toBeInTheDocument();
    });
  });
});
