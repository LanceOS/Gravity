import { describe, expect, it } from 'vitest';
import type { Ticket } from '../../../context/TicketContextContext';
import { createWorkspaceProjectCounts } from './workspaceProjectCounts';

function makeTicket(overrides: Partial<Ticket>): Ticket {
  return {
    id: 'ticket-1',
    key: 'GRA-1',
    title: 'Seed ticket',
    description: '',
    status: 'todo',
    priority: 'medium',
    assigneeId: null,
    projectId: 'project-1',
    domainId: null,
    cycleId: null,
    parentId: null,
    prStatus: 'none',
    prUrl: null,
    createdAt: '2026-06-18T12:00:00.000Z',
    updatedAt: '2026-06-18T12:00:00.000Z',
    ...overrides,
  };
}

describe('createWorkspaceProjectCounts', () => {
  it('aggregates counts per project without rescanning unchanged ticket arrays', () => {
    const projectOneTickets = [
      makeTicket({
        id: 'ticket-1',
        key: 'GRA-1',
        assigneeId: 'user-1',
        labelIds: ['label-1'],
        cycleId: 'cycle-1',
      }),
      makeTicket({
        id: 'ticket-2',
        key: 'GRA-2',
        status: 'done',
        labelIds: ['label-1'],
      }),
    ];
    let projectTwoTickets = [
      makeTicket({
        id: 'ticket-3',
        key: 'OPS-3',
        projectId: 'project-2',
        assigneeId: 'user-2',
        labelIds: ['label-2', 'label-3'],
        cycleId: 'cycle-2',
        createdAt: '2026-06-18T13:00:00.000Z',
        updatedAt: '2026-06-18T13:00:00.000Z',
      }),
    ];

    const projects = [{ id: 'project-1' }, { id: 'project-2' }];
    const getProjectTickets = (projectId: string) => (projectId === 'project-1' ? projectOneTickets : projectTwoTickets);

    const first = createWorkspaceProjectCounts(projects, getProjectTickets, 'user-1');
    const second = createWorkspaceProjectCounts(projects, getProjectTickets, 'user-1');

    expect(first['project-1']).toMatchObject({
      myIssues: 1,
      activeProjectIssues: 1,
      labels: { 'label-1': 1 },
      cycles: { 'cycle-1': 1 },
    });
    expect(first['project-2']).toMatchObject({
      myIssues: 0,
      activeProjectIssues: 1,
      labels: { 'label-2': 1, 'label-3': 1 },
      cycles: { 'cycle-2': 1 },
    });
    expect(second['project-1']).toBe(first['project-1']);
    expect(second['project-2']).toBe(first['project-2']);

    projectTwoTickets = [
      ...projectTwoTickets,
      makeTicket({
        id: 'ticket-4',
        key: 'OPS-4',
        projectId: 'project-2',
        assigneeId: 'user-1',
        labelIds: ['label-2'],
        cycleId: 'cycle-2',
        createdAt: '2026-06-18T14:00:00.000Z',
        updatedAt: '2026-06-18T14:00:00.000Z',
      }),
    ];

    const third = createWorkspaceProjectCounts(projects, getProjectTickets, 'user-1');

    expect(third['project-2']).not.toBe(first['project-2']);
    expect(third['project-2']).toMatchObject({
      myIssues: 1,
      activeProjectIssues: 2,
      labels: { 'label-2': 2, 'label-3': 1 },
      cycles: { 'cycle-2': 2 },
    });
  });
});
