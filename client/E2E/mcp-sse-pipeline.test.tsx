import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import {
  addWorkspaceMember,
  dbState,
  getActiveMockSseSource,
  setWorkspaceMembers,
} from './setup';

type SeededWorkspace = {
  memberUser: {
    id: string;
    name: string;
    email: string;
    avatar: string;
    role: string;
    tutorial_completed: number;
  };
  nonMemberUser: {
    id: string;
    name: string;
    email: string;
    avatar: string;
    role: string;
    tutorial_completed: number;
  };
  workspace: {
    id: string;
    name: string;
    defaultProjectId: string;
    role: string;
  };
  project: {
    id: string;
    workspaceId: string;
    name: string;
    key: string;
  };
  mainTicket: {
    id: string;
    key: string;
    title: string;
    description: string;
    status: 'todo';
    priority: 'medium';
    projectId: string;
    domainId: null;
    labels: Array<{ id: string; projectId: string; name: string; color: string; description: string; sortOrder: number }>;
    labelIds: string[];
    cycleId: null;
    assigneeId: null;
    parentId: null;
    dependencies: Array<{ id: string; key: string; title: string; projectId: string }>;
    blockers: Array<{ id: string; key: string; title: string; projectId: string }>;
    relatedTicketIds: string[];
    createdAt: string;
    updatedAt: string;
    prStatus: 'none';
    prUrl: null;
  };
  dependencyTicket: {
    id: string;
    key: string;
    title: string;
    description: string;
    status: 'todo';
    priority: 'medium';
    projectId: string;
    domainId: null;
    labels: Array<{ id: string; projectId: string; name: string; color: string; description: string; sortOrder: number }>;
    labelIds: string[];
    cycleId: null;
    assigneeId: null;
    parentId: null;
    dependencies: Array<{ id: string; key: string; title: string; projectId: string }>;
    blockers: Array<{ id: string; key: string; title: string; projectId: string }>;
    relatedTicketIds: string[];
    createdAt: string;
    updatedAt: string;
    prStatus: 'none';
    prUrl: null;
  };
  bugLabel: {
    id: string;
    projectId: string;
    name: string;
    color: string;
    description: string;
    sortOrder: number;
  };
};

function seedRealtimeWorkspace(): SeededWorkspace {
  const now = new Date('2026-06-18T12:00:00.000Z').toISOString();
  const memberUser = {
    id: 'usr-member',
    name: 'Member User',
    email: 'member@gravity.test',
    avatar: '',
    role: 'owner',
    tutorial_completed: 1,
  };
  const nonMemberUser = {
    id: 'usr-nonmember',
    name: 'Outside User',
    email: 'outside@gravity.test',
    avatar: '',
    role: 'member',
    tutorial_completed: 1,
  };
  const workspace = {
    id: 'wsp-realtime',
    name: 'Realtime Workspace',
    defaultProjectId: 'prj-realtime',
    role: 'owner',
  };
  const project = {
    id: 'prj-realtime',
    workspaceId: workspace.id,
    name: 'Realtime Project',
    key: 'RT',
  };
  const bugLabel = {
    id: 'lbl-bug',
    projectId: project.id,
    name: 'Bug',
    color: '#ef4444',
    description: 'Bug label',
    sortOrder: 0,
  };
  const mainTicket = {
    id: 'tkt-main',
    key: 'RT-1',
    title: 'Main pipeline ticket',
    description: 'Initial ticket',
    status: 'todo' as const,
    priority: 'medium' as const,
    projectId: project.id,
    domainId: null,
    labels: [],
    labelIds: [],
    cycleId: null,
    assigneeId: null,
    parentId: null,
    dependencies: [],
    blockers: [],
    relatedTicketIds: [],
    createdAt: now,
    updatedAt: now,
    prStatus: 'none' as const,
    prUrl: null,
  };
  const dependencyTicket = {
    id: 'tkt-dependency',
    key: 'RT-2',
    title: 'Dependency ticket',
    description: 'Secondary ticket',
    status: 'todo' as const,
    priority: 'medium' as const,
    projectId: project.id,
    domainId: null,
    labels: [],
    labelIds: [],
    cycleId: null,
    assigneeId: null,
    parentId: null,
    dependencies: [],
    blockers: [],
    relatedTicketIds: [],
    createdAt: now,
    updatedAt: now,
    prStatus: 'none' as const,
    prUrl: null,
  };

  dbState.currentUser = memberUser;
  dbState.tutorialCompleted = true;
  dbState.accountSettings = {
    userId: memberUser.id,
    theme: 'dark',
    projectLayout: 'standard' as any,
    notificationsEnabled: true,
  };
  dbState.workspaces = [workspace];
  setWorkspaceMembers([{ workspaceId: workspace.id, userId: memberUser.id, role: 'owner' }]);
  addWorkspaceMember(workspace.id, memberUser.id, 'owner');
  dbState.projects = [project];
  dbState.labels = [bugLabel];
  dbState.tickets = [mainTicket, dependencyTicket];
  dbState.comments = [];
  window.localStorage.setItem('gravity_theme', 'dark');

  return {
    memberUser,
    nonMemberUser,
    workspace,
    project,
    mainTicket,
    dependencyTicket,
    bugLabel,
  };
}

async function callMcpTool(
  workspaceId: string,
  actorUserId: string,
  name: string,
  args: Record<string, unknown>,
) {
  const response = await fetch('/api/v1/mcp/sse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-Id': workspaceId,
      'X-Mock-User-Id': actorUserId,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    }),
  });

  expect(response.ok).toBe(true);
  const payload = await response.json();
  expect(payload.error).toBeUndefined();
  return payload;
}

async function renderRealtimeApp(workspaceId: string, userId: string) {
  const user = userEvent.setup();
  render(<App />);

  await waitFor(() => {
    expect(getActiveMockSseSource(workspaceId, userId)).toBeTruthy();
  });

  return user;
}

describe('MCP SSE pipeline', () => {
  it('refreshes the client UI from MCP mutation events without a refresh', async () => {
    const { memberUser, workspace, project, mainTicket, dependencyTicket } = seedRealtimeWorkspace();
    const user = await renderRealtimeApp(workspace.id, memberUser.id);

    const mainTicketCard = await screen.findByText(mainTicket.title);
    expect(mainTicketCard).toBeInTheDocument();

    await user.click(mainTicketCard);

    const sidebar = await screen.findByTestId('desktop-sidebar');
    expect(within(sidebar).getByText('No labels assigned')).toBeInTheDocument();
    expect(within(sidebar).getByText('No dependencies')).toBeInTheDocument();

    await callMcpTool(workspace.id, memberUser.id, 'create_ticket', {
      title: 'MCP-created ticket',
      description: 'Created through the MCP transport.',
      projectId: project.id,
      status: 'todo',
      priority: 'medium',
    });
    expect(await screen.findByText('MCP-created ticket')).toBeInTheDocument();

    await callMcpTool(workspace.id, memberUser.id, 'update_ticket', {
      ticketKey: mainTicket.key,
      title: 'Main pipeline ticket updated',
    });
    await waitFor(() => {
      expect(screen.getByDisplayValue('Main pipeline ticket updated')).toBeInTheDocument();
    });

    await callMcpTool(workspace.id, memberUser.id, 'add_comment', {
      ticketKey: mainTicket.key,
      body: 'Comment created through MCP.',
    });
    expect(await screen.findByText('Comment created through MCP.')).toBeInTheDocument();
    expect(screen.getByText('Activity Thread (1)')).toBeInTheDocument();

    await callMcpTool(workspace.id, memberUser.id, 'add_ticket_labels', {
      ticketKey: mainTicket.key,
      labels: 'Bug',
    });
    await waitFor(() => {
      expect(within(sidebar).getByText('Bug')).toBeInTheDocument();
    });

    await callMcpTool(workspace.id, memberUser.id, 'remove_ticket_labels', {
      ticketKey: mainTicket.key,
      labels: 'Bug',
    });
    await waitFor(() => {
      expect(within(sidebar).getByText('No labels assigned')).toBeInTheDocument();
    });

    await callMcpTool(workspace.id, memberUser.id, 'add_dependency', {
      ticketKey: mainTicket.key,
      dependencyTicketKey: dependencyTicket.key,
    });
    await waitFor(() => {
      expect(within(sidebar).getByText(dependencyTicket.key)).toBeInTheDocument();
    });

    await callMcpTool(workspace.id, memberUser.id, 'remove_dependency', {
      ticketKey: mainTicket.key,
      dependencyTicketKey: dependencyTicket.key,
    });
    await waitFor(() => {
      expect(within(sidebar).getByText('No dependencies')).toBeInTheDocument();
    });
  });

  it('does not deliver SSE events to a non-member source', async () => {
    const { memberUser, nonMemberUser, workspace, mainTicket } = seedRealtimeWorkspace();
    await renderRealtimeApp(workspace.id, memberUser.id);

    const memberSource = getActiveMockSseSource(workspace.id, memberUser.id);
    expect(memberSource).toBeTruthy();

    dbState.currentUser = nonMemberUser;
    const deniedSource = new EventSource(`/api/v1/events/subscribe?workspaceId=${workspace.id}`) as any;
    const deniedMessageSpy = vi.fn();
    deniedSource.addEventListener('message', deniedMessageSpy);

    await callMcpTool(workspace.id, memberUser.id, 'update_ticket', {
      ticketKey: mainTicket.key,
      title: 'Member-visible title',
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Member-visible title')).toBeInTheDocument();
    });

    expect(deniedMessageSpy).not.toHaveBeenCalled();
    expect(getActiveMockSseSource(workspace.id, nonMemberUser.id)).toBeUndefined();

    deniedSource.close();
  });

  it('reconnects after disconnecting and keeps updating the UI', async () => {
    const { memberUser, workspace, mainTicket } = seedRealtimeWorkspace();
    await renderRealtimeApp(workspace.id, memberUser.id);

    const initialSource = getActiveMockSseSource(workspace.id, memberUser.id);
    expect(initialSource).toBeTruthy();

    initialSource?.emitError();

    await waitFor(() => {
      const nextSource = getActiveMockSseSource(workspace.id, memberUser.id);
      expect(nextSource).toBeTruthy();
      expect(nextSource).not.toBe(initialSource);
    }, { timeout: 6000 });

    await callMcpTool(workspace.id, memberUser.id, 'update_ticket', {
      ticketKey: mainTicket.key,
      title: 'Recovered after reconnect',
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Recovered after reconnect')).toBeInTheDocument();
    });
  });

  it('coalesces rapid mutations into a single targeted refresh', async () => {
    const { memberUser, workspace, mainTicket } = seedRealtimeWorkspace();
    await renderRealtimeApp(workspace.id, memberUser.id);

    const mainTicketCard = await screen.findByText(mainTicket.title);
    expect(mainTicketCard).toBeInTheDocument();
    await userEvent.click(mainTicketCard);

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockClear();

    await Promise.all([
      callMcpTool(workspace.id, memberUser.id, 'update_ticket', {
        ticketKey: mainTicket.key,
        title: 'Burst update 1',
      }),
      callMcpTool(workspace.id, memberUser.id, 'update_ticket', {
        ticketKey: mainTicket.key,
        title: 'Burst update 2',
      }),
      callMcpTool(workspace.id, memberUser.id, 'update_ticket', {
        ticketKey: mainTicket.key,
        title: 'Burst update 3',
      }),
    ]);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Burst update 3')).toBeInTheDocument();
    });

    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/v1/tickets/key/RT-1') &&
      String(url).includes('include=relations'),
    );
    expect(refreshCalls).toHaveLength(1);
  });
});
