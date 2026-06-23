import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { dbState, resetMockDb } from './setup';
import { router } from '../src/router';

describe('Relationship cleanup on status transition to done E2E', () => {
  it('automatically removes all blocker/dependency relationships involving a ticket when it is marked as done', async () => {
    const user = userEvent.setup();

    // 1. Seed mock DB
    dbState.currentUser = { id: 'usr-1', name: 'E2E User', email: 'e2e@gravity.test', tutorial_completed: 1 } as any;
    const workspace = { id: 'wsp-1', name: 'E2E Workspace', defaultProjectId: 'prj-1', role: 'owner' };
    const project = { id: 'prj-1', workspaceId: 'wsp-1', name: 'E2E Project', key: 'TST' };
    dbState.workspaces.push(workspace);
    dbState.projects.push(project);

    const completedTicket = {
      id: 'ticket-done-cleanup-1',
      key: 'TST-1',
      title: 'Completed ticket',
      description: 'Finished task',
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
      dependencies: [],
      blockers: [],
      relatedTicketIds: [],
    };

    const blockedTicket = {
      id: 'ticket-done-cleanup-2',
      key: 'TST-2',
      title: 'Previously blocked ticket',
      description: 'Waiting on TST-1',
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
      dependencies: [],
      blockers: [],
      relatedTicketIds: [],
    };

    // Establish the relationship: TST-1 blocks TST-2
    completedTicket.dependencies.push({
      id: blockedTicket.id,
      key: blockedTicket.key,
      title: blockedTicket.title,
      projectId: blockedTicket.projectId,
    });
    completedTicket.relatedTicketIds.push(blockedTicket.id);

    blockedTicket.blockers.push({
      id: completedTicket.id,
      key: completedTicket.key,
      title: completedTicket.title,
      projectId: completedTicket.projectId,
    });
    blockedTicket.relatedTicketIds.push(completedTicket.id);

    dbState.tickets.push(completedTicket, blockedTicket);

    // 2. Navigate and render App
    await router.navigate('/workspaces/wsp-1/projects/prj-1/tickets');
    render(<App />);

    // 3. Open completed ticket (TST-1) details by clicking its card on the board
    const completedCard = await screen.findByText(completedTicket.title);
    expect(completedCard).toBeInTheDocument();
    await user.click(completedCard);

    // Verify it is blocking TST-2 (shows "Blocks" relation in Details sidebar)
    const sidebar = await screen.findByTestId('desktop-sidebar');
    expect(within(sidebar).getAllByText(blockedTicket.key).length).toBeGreaterThan(0);

    // 4. Change status of Completed ticket to Done
    const statusSelect = await within(sidebar).findByRole('button', { name: /Select ticket status/i });
    await user.click(statusSelect);

    const doneOption = await screen.findByRole('option', { name: /Done/i });
    await user.click(doneOption);

    // 5. Verify relationship is cleaned up in dbState
    await waitFor(() => {
      expect(completedTicket.status).toBe('done');
      expect(completedTicket.dependencies).toEqual([]);
      expect(completedTicket.blockers).toEqual([]);
      expect(completedTicket.relatedTicketIds).toEqual([]);
      
      expect(blockedTicket.dependencies).toEqual([]);
      expect(blockedTicket.blockers).toEqual([]);
      expect(blockedTicket.relatedTicketIds).toEqual([]);
    });

    // 6. Verify relation indicator "Blocks" has disappeared from the sidebar
    expect(within(sidebar).queryByText(blockedTicket.key)).not.toBeInTheDocument();
  });
});
