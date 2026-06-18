import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Mock standard JSDOM/browser API gaps
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

type MockUser = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role?: string;
  tutorial_completed?: number | boolean;
};

type MockWorkspaceMember = {
  workspaceId: string;
  userId: string;
  role: string;
};

type MockWorkspace = {
  id: string;
  name: string;
  defaultProjectId: string | null;
  role: string;
};

type MockProject = {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  teamId?: string | null;
};

type MockLabel = {
  id: string;
  projectId?: string | null;
  teamId?: string | null;
  name: string;
  color: string;
  description: string;
  sortOrder: number;
};

type MockRelation = {
  id: string;
  key: string;
  title: string;
  projectId: string;
};

type MockTicket = {
  id: string;
  key: string;
  title: string;
  description: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled';
  priority: 'no_priority' | 'low' | 'medium' | 'high' | 'urgent';
  projectId: string;
  domainId: string | null;
  labels?: MockLabel[];
  labelIds?: string[];
  cycleId: string | null;
  assigneeId: string | null;
  parentId: string | null;
  dependencies?: MockRelation[];
  blockers?: MockRelation[];
  relatedTicketIds?: string[];
  createdAt: string;
  updatedAt?: string;
  prStatus: 'open' | 'merged' | 'closed' | 'none';
  prUrl: string | null;
};

type MockComment = {
  id: string;
  ticketId: string;
  body: string;
  userId: string;
  createdAt: string;
  userName?: string;
  userAvatar?: string;
};

type MockAccountSettings = {
  userId: string;
  theme: 'dark' | 'light';
  projectLayout: 'condensed' | 'spacious';
  notificationsEnabled: boolean;
};

type MockToolName =
  | 'create_ticket'
  | 'update_ticket'
  | 'add_comment'
  | 'create_comment'
  | 'add_ticket_labels'
  | 'remove_ticket_labels'
  | 'set_ticket_labels'
  | 'add_dependency'
  | 'remove_dependency'
  | 'add_ticket_dependency'
  | 'remove_ticket_dependency'
  | 'get_ticket_labels'
  | 'read_comments'
  | 'tools/list';

// In-memory mock database state for client E2E
export interface MockState {
  currentUser: MockUser | null;
  tutorialCompleted: boolean;
  workspaces: MockWorkspace[];
  workspaceMembers: MockWorkspaceMember[];
  projects: MockProject[];
  tickets: MockTicket[];
  labels: MockLabel[];
  cycles: Array<{ id: string; projectId: string; name: string; number: number; active: boolean }>;
  comments: MockComment[];
  accountSettings: MockAccountSettings | null;
}

export let dbState: MockState = {
  currentUser: null,
  tutorialCompleted: false,
  workspaces: [],
  workspaceMembers: [],
  projects: [],
  tickets: [],
  labels: [],
  cycles: [],
  comments: [],
  accountSettings: null,
};

type SseListener = (event: MessageEvent | Event) => void;

const activeMockEventSourcesByWorkspace = new Map<string, Set<MockEventSource>>();
const allMockEventSources = new Set<MockEventSource>();

function addToWorkspaceSet(workspaceId: string, source: MockEventSource) {
  const existing = activeMockEventSourcesByWorkspace.get(workspaceId);
  if (existing) {
    existing.add(source);
    return;
  }

  activeMockEventSourcesByWorkspace.set(workspaceId, new Set([source]));
}

function removeFromWorkspaceSet(workspaceId: string, source: MockEventSource) {
  const existing = activeMockEventSourcesByWorkspace.get(workspaceId);
  if (!existing) {
    return;
  }

  existing.delete(source);
  if (existing.size === 0) {
    activeMockEventSourcesByWorkspace.delete(workspaceId);
  }
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseUrl(input: RequestInfo | URL): URL {
  const raw = typeof input === 'string' ? input : input.toString();
  return new URL(raw, 'http://localhost');
}

function getHeader(init: RequestInit | undefined, name: string): string | undefined {
  const headers = init?.headers;
  if (!headers) {
    return undefined;
  }

  const target = name.toLowerCase();

  if (headers instanceof Headers) {
    return headers.get(name) ?? headers.get(target) ?? undefined;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (key.toLowerCase() === target) {
        return Array.isArray(value) ? value[0] : value;
      }
    }
    return undefined;
  }

  const record = headers as Record<string, string | undefined>;
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() === target) {
      return value;
    }
  }
  return undefined;
}

function parseJsonBody(init?: RequestInit) {
  if (!init?.body) {
    return null;
  }

  if (typeof init.body === 'string') {
    try {
      return JSON.parse(init.body);
    } catch {
      return null;
    }
  }

  if (init.body instanceof URLSearchParams) {
    return Object.fromEntries(init.body.entries());
  }

  return init.body;
}

function canonicalizeStatus(status: unknown): MockTicket['status'] {
  switch (status) {
    case 'backlog':
    case 'todo':
    case 'in_progress':
    case 'in_review':
    case 'done':
    case 'canceled':
      return status;
    default:
      return 'todo';
  }
}

function canonicalizePriority(priority: unknown): MockTicket['priority'] {
  switch (priority) {
    case 'no_priority':
    case 'low':
    case 'medium':
    case 'high':
    case 'urgent':
      return priority;
    default:
      return 'no_priority';
  }
}

function getWorkspaceById(workspaceId: string) {
  return dbState.workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
}

function getProjectById(projectId: string) {
  return dbState.projects.find((project) => project.id === projectId) ?? null;
}

function getTicketById(ticketId: string) {
  return dbState.tickets.find((ticket) => ticket.id === ticketId) ?? null;
}

function getTicketByKey(ticketKey: string) {
  return dbState.tickets.find((ticket) => ticket.key.toUpperCase() === ticketKey.toUpperCase()) ?? null;
}

function getLabelById(labelId: string) {
  return dbState.labels.find((label) => label.id === labelId) ?? null;
}

function getProjectScope(projectId: string) {
  const project = getProjectById(projectId);
  if (!project) {
    return null;
  }

  return {
    project,
    workspaceId: project.workspaceId,
    teamId: project.teamId ?? `team-${project.workspaceId}`,
  };
}

function isWorkspaceMember(workspaceId: string, userId: string | null | undefined) {
  if (!userId) {
    return false;
  }

  const explicitMembers = dbState.workspaceMembers.filter((member) => member.workspaceId === workspaceId);
  if (explicitMembers.length > 0) {
    return explicitMembers.some((member) => member.userId === userId);
  }

  return Boolean(getWorkspaceById(workspaceId));
}

export function setWorkspaceMembers(members: MockWorkspaceMember[]) {
  dbState.workspaceMembers = members.map((member) => ({ ...member }));
}

export function addWorkspaceMember(workspaceId: string, userId: string, role = 'member') {
  const existing = dbState.workspaceMembers.find(
    (member) => member.workspaceId === workspaceId && member.userId === userId,
  );

  if (existing) {
    existing.role = role;
    return existing;
  }

  const member = { workspaceId, userId, role };
  dbState.workspaceMembers.push(member);
  return member;
}

function resolveCurrentUserId(init: RequestInit | undefined, body: any) {
  const headerUserId = normalizeText(getHeader(init, 'x-mock-user-id') ?? getHeader(init, 'x-user-id'));
  if (headerUserId) {
    return headerUserId;
  }

  const bodyUserId = normalizeText(body?.actorUserId ?? body?.userId);
  if (bodyUserId) {
    return bodyUserId;
  }

  return dbState.currentUser?.id ?? null;
}

function resetMockSseRegistry() {
  for (const source of Array.from(allMockEventSources)) {
    source.close();
  }
  activeMockEventSourcesByWorkspace.clear();
  allMockEventSources.clear();
}

export function getActiveMockSseSources(workspaceId: string) {
  return Array.from(activeMockEventSourcesByWorkspace.get(workspaceId) ?? []);
}

export function getActiveMockSseSource(workspaceId: string, userId?: string) {
  const sources = getActiveMockSseSources(workspaceId);
  for (let index = sources.length - 1; index >= 0; index -= 1) {
    const source = sources[index];
    if (!userId || source.userId === userId) {
      return source;
    }
  }
  return undefined;
}

function serializeLabel(label: MockLabel) {
  return {
    id: label.id,
    projectId: label.projectId ?? null,
    teamId: label.teamId ?? null,
    name: label.name,
    color: label.color,
    description: label.description,
    sortOrder: label.sortOrder,
  };
}

function sortLabels(labels: MockLabel[]) {
  return [...labels].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

function resolveLabelsForTicket(ticket: MockTicket) {
  if (ticket.labels && ticket.labels.length > 0) {
    return sortLabels(ticket.labels.map((label) => getLabelById(label.id) ?? label)).map(serializeLabel);
  }

  const labelIds = ticket.labelIds ?? [];
  return sortLabels(
    labelIds
      .map((labelId) => getLabelById(labelId))
      .filter((label): label is MockLabel => Boolean(label)),
  ).map(serializeLabel);
}

function relationFromTicket(ticket: MockTicket): MockRelation {
  return {
    id: ticket.id,
    key: ticket.key,
    title: ticket.title,
    projectId: ticket.projectId,
  };
}

function ensureTicketRelations(ticket: MockTicket) {
  ticket.labelIds = ticket.labelIds ?? [];
  ticket.labels = resolveLabelsForTicket(ticket).map((label) => ({
    id: label.id,
    projectId: label.projectId ?? undefined,
    teamId: label.teamId ?? undefined,
    name: label.name,
    color: label.color,
    description: label.description,
    sortOrder: label.sortOrder,
  }));
  ticket.dependencies = ticket.dependencies ?? [];
  ticket.blockers = ticket.blockers ?? [];
  ticket.relatedTicketIds = Array.from(
    new Set([
      ...(ticket.dependencies ?? []).map((relation) => relation.id),
      ...(ticket.blockers ?? []).map((relation) => relation.id),
    ]),
  );
  ticket.updatedAt = ticket.updatedAt ?? ticket.createdAt;
}

function serializeTicket(ticket: MockTicket) {
  ensureTicketRelations(ticket);
  return {
    ...ticket,
    status: canonicalizeStatus(ticket.status),
    priority: canonicalizePriority(ticket.priority),
    labels: resolveLabelsForTicket(ticket),
    dependencies: (ticket.dependencies ?? []).map((relation) => ({ ...relation })),
    blockers: (ticket.blockers ?? []).map((relation) => ({ ...relation })),
    relatedTicketIds: [...(ticket.relatedTicketIds ?? [])],
    labelIds: [...(ticket.labelIds ?? [])],
    updatedAt: ticket.updatedAt ?? ticket.createdAt,
  };
}

function serializeComment(comment: MockComment) {
  return {
    ...comment,
    userName: comment.userName ?? dbState.currentUser?.name ?? 'Member',
    userAvatar: comment.userAvatar ?? dbState.currentUser?.avatar ?? '',
  };
}

function responseForTicketKey(ticketKey: string) {
  const ticket = getTicketByKey(ticketKey);
  if (!ticket) {
    return null;
  }
  return serializeTicket(ticket);
}

function getProjectTicketKeyPrefix(projectId: string) {
  return getProjectById(projectId)?.key ?? 'GRV';
}

function nextTicketKey(projectId: string) {
  const prefix = getProjectTicketKeyPrefix(projectId);
  const count = dbState.tickets.filter((ticket) => ticket.projectId === projectId).length + 1;
  return `${prefix}-${count}`;
}

function resolveTicketComments(ticketId: string) {
  return dbState.comments
    .filter((comment) => comment.ticketId === ticketId)
    .map(serializeComment);
}

function removeTicketFromRelations(ticketId: string) {
  for (const ticket of dbState.tickets) {
    ticket.dependencies = (ticket.dependencies ?? []).filter((relation) => relation.id !== ticketId);
    ticket.blockers = (ticket.blockers ?? []).filter((relation) => relation.id !== ticketId);
    ticket.relatedTicketIds = Array.from(
      new Set([
        ...(ticket.dependencies ?? []).map((relation) => relation.id),
        ...(ticket.blockers ?? []).map((relation) => relation.id),
      ]),
    );
  }
}

function upsertRelationPair(
  sourceTicket: MockTicket,
  sourceField: 'dependencies' | 'blockers',
  targetTicket: MockTicket,
  targetField: 'dependencies' | 'blockers',
) {
  const sourceRelation = relationFromTicket(targetTicket);
  const targetRelation = relationFromTicket(sourceTicket);

  sourceTicket[sourceField] = sourceTicket[sourceField] ?? [];
  targetTicket[targetField] = targetTicket[targetField] ?? [];

  if (!sourceTicket[sourceField]?.some((relation) => relation.id === sourceRelation.id)) {
    sourceTicket[sourceField]!.push(sourceRelation);
  }

  if (!targetTicket[targetField]?.some((relation) => relation.id === targetRelation.id)) {
    targetTicket[targetField]!.push(targetRelation);
  }

  sourceTicket.relatedTicketIds = Array.from(
    new Set([
      ...(sourceTicket.dependencies ?? []).map((relation) => relation.id),
      ...(sourceTicket.blockers ?? []).map((relation) => relation.id),
    ]),
  );
  targetTicket.relatedTicketIds = Array.from(
    new Set([
      ...(targetTicket.dependencies ?? []).map((relation) => relation.id),
      ...(targetTicket.blockers ?? []).map((relation) => relation.id),
    ]),
  );
  sourceTicket.updatedAt = new Date().toISOString();
  targetTicket.updatedAt = new Date().toISOString();
}

function removeRelationPair(
  sourceTicket: MockTicket,
  sourceField: 'dependencies' | 'blockers',
  targetTicket: MockTicket,
  targetField: 'dependencies' | 'blockers',
) {
  sourceTicket[sourceField] = (sourceTicket[sourceField] ?? []).filter((relation) => relation.id !== targetTicket.id);
  targetTicket[targetField] = (targetTicket[targetField] ?? []).filter((relation) => relation.id !== sourceTicket.id);

  sourceTicket.relatedTicketIds = Array.from(
    new Set([
      ...(sourceTicket.dependencies ?? []).map((relation) => relation.id),
      ...(sourceTicket.blockers ?? []).map((relation) => relation.id),
    ]),
  );
  targetTicket.relatedTicketIds = Array.from(
    new Set([
      ...(targetTicket.dependencies ?? []).map((relation) => relation.id),
      ...(targetTicket.blockers ?? []).map((relation) => relation.id),
    ]),
  );
  sourceTicket.updatedAt = new Date().toISOString();
  targetTicket.updatedAt = new Date().toISOString();
}

function resolveLabelsByNames(projectId: string, labelNames: string[]) {
  const projectLabels = dbState.labels.filter((label) => label.projectId === projectId || label.projectId === null);
  const resolved = labelNames
    .map((labelName) => projectLabels.find((label) => label.name === labelName))
    .filter((label): label is MockLabel => Boolean(label));

  if (resolved.length !== labelNames.length) {
    const found = new Set(resolved.map((label) => label.name));
    const missing = labelNames.filter((labelName) => !found.has(labelName));
    throw new Error(`The following labels do not exist in this project: ${missing.join(', ')}`);
  }

  return sortLabels(resolved);
}

function resolveLabelNames(input: unknown) {
  if (typeof input === 'string') {
    return input.split(',').map((name) => name.trim()).filter(Boolean);
  }

  if (Array.isArray(input)) {
    return input.map((value) => normalizeText(value)).filter(Boolean);
  }

  return [];
}

function setTicketLabelsByNames(ticket: MockTicket, labelNames: string[]) {
  if (labelNames.length === 0) {
    ticket.labelIds = [];
    ticket.labels = [];
    ticket.updatedAt = new Date().toISOString();
    return [];
  }

  const resolved = resolveLabelsByNames(ticket.projectId, labelNames);
  ticket.labelIds = resolved.map((label) => label.id);
  ticket.labels = resolved.map((label) => ({
    id: label.id,
    projectId: label.projectId ?? undefined,
    teamId: label.teamId ?? undefined,
    name: label.name,
    color: label.color,
    description: label.description,
    sortOrder: label.sortOrder,
  }));
  ticket.updatedAt = new Date().toISOString();
  return resolved;
}

function appendTicketLabels(ticket: MockTicket, labelNames: string[]) {
  const current = new Set(resolveLabelsForTicket(ticket).map((label) => label.name));
  const nextNames = [...current];
  for (const labelName of labelNames) {
    if (!current.has(labelName)) {
      nextNames.push(labelName);
    }
  }
  return setTicketLabelsByNames(ticket, nextNames);
}

function removeTicketLabelsByName(ticket: MockTicket, labelNames: string[]) {
  const namesToRemove = new Set(labelNames);
  const nextNames = resolveLabelsForTicket(ticket)
    .map((label) => label.name)
    .filter((labelName) => !namesToRemove.has(labelName));
  return setTicketLabelsByNames(ticket, nextNames);
}

function broadcastWorkspaceEvent(workspaceId: string, type: string, data: unknown) {
  const sources = activeMockEventSourcesByWorkspace.get(workspaceId);
  if (!sources || sources.size === 0) {
    return;
  }

  const payload = JSON.stringify({ type, data });
  for (const source of sources) {
    source.emitMessage(payload);
  }
}

function publishTicketEvent(params: {
  workspaceId: string;
  projectId: string;
  teamId: string;
  ticketKey: string;
  actorUserId: string;
  type: string;
  data?: Record<string, unknown>;
}) {
  broadcastWorkspaceEvent(params.workspaceId, params.type, {
    type: params.type,
    workspaceId: params.workspaceId,
    projectId: params.projectId,
    teamId: params.teamId,
    ticketKey: params.ticketKey,
    actorUserId: params.actorUserId,
    timestamp: new Date().toISOString(),
    data: params.data ?? {},
  });
}

class MockEventSource {
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onopen: ((event: Event) => void) | null = null;
  public readyState = 0;
  public readonly workspaceId: string;
  public readonly userId: string | null;
  public readonly denied: boolean;

  private readonly messageHandlers = new Set<SseListener>();
  private readonly errorHandlers = new Set<SseListener>();
  private readonly openHandlers = new Set<SseListener>();
  private closed = false;

  constructor(public readonly url: string) {
    const parsed = parseUrl(url);
    this.workspaceId = parsed.searchParams.get('workspaceId') ?? '';
    this.userId = dbState.currentUser?.id ?? null;
    this.denied = !this.workspaceId || !this.userId || !isWorkspaceMember(this.workspaceId, this.userId);

    allMockEventSources.add(this);

    if (this.denied) {
      this.readyState = 2;
      return;
    }

    addToWorkspaceSet(this.workspaceId, this);
    queueMicrotask(() => this.emitOpen());
  }

  addEventListener(type: 'message' | 'error' | 'open', handler: SseListener): void {
    if (type === 'message') {
      this.messageHandlers.add(handler);
      return;
    }
    if (type === 'error') {
      this.errorHandlers.add(handler);
      return;
    }
    this.openHandlers.add(handler);
  }

  removeEventListener(type: 'message' | 'error' | 'open', handler: SseListener): void {
    if (type === 'message') {
      this.messageHandlers.delete(handler);
      return;
    }
    if (type === 'error') {
      this.errorHandlers.delete(handler);
      return;
    }
    this.openHandlers.delete(handler);
  }

  emitMessage(data: string): void {
    if (this.closed || this.denied) {
      return;
    }

    const event = new MessageEvent('message', { data });
    this.onmessage?.(event);
    for (const handler of this.messageHandlers) {
      handler(event);
    }
  }

  emitError(): void {
    if (this.closed || this.denied) {
      return;
    }

    this.readyState = 0;
    const event = new Event('error');
    this.onerror?.(event);
    for (const handler of this.errorHandlers) {
      handler(event);
    }
  }

  emitOpen(): void {
    if (this.closed || this.denied) {
      return;
    }

    this.readyState = 1;
    const event = new Event('open');
    this.onopen?.(event);
    for (const handler of this.openHandlers) {
      handler(event);
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.readyState = 2;
    if (!this.denied && this.workspaceId) {
      removeFromWorkspaceSet(this.workspaceId, this);
    }
    allMockEventSources.delete(this);
  }
}

globalThis.EventSource = MockEventSource as any;
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'EventSource', {
    configurable: true,
    writable: true,
    value: MockEventSource,
  });
}

function jsonResponse(status: number, data: any) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (data !== undefined ? JSON.parse(JSON.stringify(data)) : data),
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

function buildMemberList(workspaceId: string) {
  const members = dbState.workspaceMembers.filter((member) => member.workspaceId === workspaceId);
  if (members.length > 0) {
    return members.map((member) => ({
      id: `mem-${workspaceId}-${member.userId}`,
      userId: member.userId,
      role: member.role,
      user: member.userId === dbState.currentUser?.id
        ? dbState.currentUser
        : {
            id: member.userId,
            name: `Member ${member.userId}`,
            email: `${member.userId}@gravity.test`,
            avatar: '',
            role: member.role,
          },
    }));
  }

  return dbState.currentUser
    ? [{
        id: `mem-${workspaceId}-${dbState.currentUser.id}`,
        userId: dbState.currentUser.id,
        role: 'owner',
        user: dbState.currentUser,
      }]
    : [];
}

function buildTicketRecordFromBody(body: any, projectId: string) {
  const project = getProjectById(projectId);
  const labelNames = resolveLabelNames(body?.labels ?? body?.labelNames);
  const labelIds = Array.isArray(body?.labelIds)
    ? body.labelIds.map((labelId: unknown) => String(labelId))
    : [];
  const resolvedLabels = labelNames.length > 0
    ? resolveLabelsByNames(projectId, labelNames)
    : labelIds.map((labelId) => getLabelById(labelId)).filter((label): label is MockLabel => Boolean(label));
  const now = new Date().toISOString();
  const ticket: MockTicket = {
    id: `tkt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    key: `${project?.key ?? 'GRV'}-${dbState.tickets.filter((ticketRecord) => ticketRecord.projectId === projectId).length + 1}`,
    title: normalizeText(body?.title) || 'Untitled ticket',
    description: typeof body?.description === 'string' ? body.description : '',
    status: canonicalizeStatus(body?.status),
    priority: canonicalizePriority(body?.priority),
    projectId,
    domainId: body?.domainId ?? null,
    labels: resolvedLabels.map((label) => ({ ...label })),
    labelIds: resolvedLabels.map((label) => label.id),
    cycleId: body?.cycleId ?? null,
    assigneeId: body?.assigneeId ?? null,
    parentId: body?.parentId ?? null,
    dependencies: [],
    blockers: [],
    relatedTicketIds: [],
    createdAt: now,
    updatedAt: now,
    prStatus: body?.prStatus ?? 'none',
    prUrl: body?.prUrl ?? null,
  };

  ensureTicketRelations(ticket);
  return ticket;
}

async function executeMockMcpTool(workspaceId: string, actorUserId: string, toolName: string, args: Record<string, unknown>) {
  if (!isWorkspaceMember(workspaceId, actorUserId)) {
    throw new Error('Unauthorized workspace access.');
  }

  switch (toolName as MockToolName) {
    case 'tools/list':
      return {
        tools: [
          { name: 'create_ticket' },
          { name: 'update_ticket' },
          { name: 'add_comment' },
          { name: 'create_comment' },
          { name: 'add_ticket_labels' },
          { name: 'remove_ticket_labels' },
          { name: 'set_ticket_labels' },
          { name: 'add_dependency' },
          { name: 'remove_dependency' },
          { name: 'get_ticket_labels' },
          { name: 'read_comments' },
        ],
      };

    case 'create_ticket': {
      const projectId = String(args.projectId ?? '').trim();
      const project = getProjectById(projectId);
      if (!project || project.workspaceId !== workspaceId) {
        throw new Error('Project not found.');
      }

      const ticket = buildTicketRecordFromBody(args, projectId);
      dbState.tickets.push(ticket);

      const scope = getProjectScope(projectId);
      if (scope) {
        publishTicketEvent({
          workspaceId: scope.workspaceId,
          projectId,
          teamId: scope.teamId,
          ticketKey: ticket.key,
          actorUserId,
          type: 'ticket.created',
          data: { ticketId: ticket.id },
        });

        if (ticket.parentId) {
          publishTicketEvent({
            workspaceId: scope.workspaceId,
            projectId,
            teamId: scope.teamId,
            ticketKey: ticket.key,
            actorUserId,
            type: 'subtask.created',
            data: { parentId: ticket.parentId },
          });
        }
      }

      return { ticket: serializeTicket(ticket) };
    }

    case 'update_ticket': {
      const ticketKey = String(args.ticketKey ?? '').toUpperCase();
      const ticket = getTicketByKey(ticketKey);
      if (!ticket) {
        throw new Error(`Ticket ${ticketKey} not found.`);
      }

      const project = getProjectById(ticket.projectId);
      if (!project || project.workspaceId !== workspaceId) {
        throw new Error('Unauthorized or workspace mismatch');
      }

      if (typeof args.title === 'string') {
        ticket.title = args.title;
      }
      if (typeof args.description === 'string') {
        ticket.description = args.description;
      }
      if (typeof args.status === 'string') {
        ticket.status = canonicalizeStatus(args.status);
      }
      if (typeof args.priority === 'string') {
        ticket.priority = canonicalizePriority(args.priority);
      }
      if (typeof args.assigneeId === 'string') {
        ticket.assigneeId = args.assigneeId;
      }
      if (typeof args.cycleId === 'string') {
        ticket.cycleId = args.cycleId;
      }
      if (typeof args.parentId === 'string') {
        ticket.parentId = args.parentId;
      }
      if (typeof args.prStatus === 'string') {
        ticket.prStatus = args.prStatus as MockTicket['prStatus'];
      }
      if (typeof args.prUrl === 'string') {
        ticket.prUrl = args.prUrl;
      }

      const labelNames = resolveLabelNames(args.labels);
      const labelIds = Array.isArray(args.labelIds) ? args.labelIds.map((labelId) => String(labelId)) : [];
      if (labelNames.length > 0) {
        setTicketLabelsByNames(ticket, labelNames);
      } else if (labelIds.length > 0) {
        const resolvedLabels = labelIds
          .map((labelId) => getLabelById(labelId))
          .filter((label): label is MockLabel => Boolean(label));
        ticket.labelIds = resolvedLabels.map((label) => label.id);
        ticket.labels = resolvedLabels.map((label) => ({ ...label }));
      }

      ticket.updatedAt = new Date().toISOString();
      ensureTicketRelations(ticket);

      const scope = getProjectScope(ticket.projectId);
      if (scope) {
        publishTicketEvent({
          workspaceId: scope.workspaceId,
          projectId: ticket.projectId,
          teamId: scope.teamId,
          ticketKey,
          actorUserId,
          type: 'ticket.updated',
          data: { updatedFields: Object.keys(args) },
        });
      }

      return { ticket: serializeTicket(ticket) };
    }

    case 'add_comment':
    case 'create_comment': {
      const ticketKey = String(args.ticketKey ?? '').toUpperCase();
      const ticket = getTicketByKey(ticketKey);
      if (!ticket) {
        throw new Error(`Ticket ${ticketKey} not found.`);
      }

      const body = normalizeText(args.body);
      if (!body) {
        throw new Error('body is required to add a comment.');
      }

      const comment: MockComment = {
        id: `cmt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        ticketId: ticket.id,
        body,
        userId: actorUserId,
        createdAt: typeof args.createdAt === 'string' ? args.createdAt : new Date().toISOString(),
        userName: dbState.currentUser?.name ?? 'Member',
        userAvatar: dbState.currentUser?.avatar ?? '',
      };
      dbState.comments.push(comment);

      const scope = getProjectScope(ticket.projectId);
      if (scope) {
        publishTicketEvent({
          workspaceId: scope.workspaceId,
          projectId: ticket.projectId,
          teamId: scope.teamId,
          ticketKey,
          actorUserId,
          type: 'comment.added',
          data: { ticketId: ticket.id, commentId: comment.id },
        });
      }

      return { comment: serializeComment(comment) };
    }

    case 'get_ticket_labels': {
      const ticketKey = String(args.ticketKey ?? '').toUpperCase();
      const ticket = getTicketByKey(ticketKey);
      if (!ticket) {
        throw new Error(`Ticket ${ticketKey} not found.`);
      }

      return { labels: resolveLabelsForTicket(ticket) };
    }

    case 'add_ticket_labels': {
      const ticketKey = String(args.ticketKey ?? '').toUpperCase();
      const ticket = getTicketByKey(ticketKey);
      if (!ticket) {
        throw new Error(`Ticket ${ticketKey} not found.`);
      }

      const labelNames = resolveLabelNames(args.labels);
      const resolved = appendTicketLabels(ticket, labelNames);
      const scope = getProjectScope(ticket.projectId);
      if (scope) {
        publishTicketEvent({
          workspaceId: scope.workspaceId,
          projectId: ticket.projectId,
          teamId: scope.teamId,
          ticketKey,
          actorUserId,
          type: 'labels.added',
          data: {
            addedLabels: labelNames,
            finalLabels: resolved.map((label) => label.name),
          },
        });
      }

      return { labels: resolveLabelsForTicket(ticket) };
    }

    case 'remove_ticket_labels': {
      const ticketKey = String(args.ticketKey ?? '').toUpperCase();
      const ticket = getTicketByKey(ticketKey);
      if (!ticket) {
        throw new Error(`Ticket ${ticketKey} not found.`);
      }

      const labelNames = resolveLabelNames(args.labels);
      const resolved = removeTicketLabelsByName(ticket, labelNames);
      const scope = getProjectScope(ticket.projectId);
      if (scope) {
        publishTicketEvent({
          workspaceId: scope.workspaceId,
          projectId: ticket.projectId,
          teamId: scope.teamId,
          ticketKey,
          actorUserId,
          type: 'labels.removed',
          data: {
            removedLabels: labelNames,
            finalLabels: resolved.map((label) => label.name),
          },
        });
      }

      return { labels: resolveLabelsForTicket(ticket) };
    }

    case 'set_ticket_labels': {
      const ticketKey = String(args.ticketKey ?? '').toUpperCase();
      const ticket = getTicketByKey(ticketKey);
      if (!ticket) {
        throw new Error(`Ticket ${ticketKey} not found.`);
      }

      const labelNames = resolveLabelNames(args.labels);
      setTicketLabelsByNames(ticket, labelNames);
      const scope = getProjectScope(ticket.projectId);
      if (scope) {
        publishTicketEvent({
          workspaceId: scope.workspaceId,
          projectId: ticket.projectId,
          teamId: scope.teamId,
          ticketKey,
          actorUserId,
          type: 'labels.set',
          data: {
            labels: labelNames,
          },
        });
      }

      return { labels: resolveLabelsForTicket(ticket) };
    }

    case 'add_dependency':
    case 'add_ticket_dependency': {
      const ticketKey = String(args.ticketKey ?? '').toUpperCase();
      const dependencyTicketKey = String(args.dependencyTicketKey ?? args.dependencyKey ?? '').toUpperCase();
      const ticket = getTicketByKey(ticketKey);
      const dependencyTicket = getTicketByKey(dependencyTicketKey);

      if (!ticket) {
        throw new Error(`Ticket ${ticketKey} not found.`);
      }
      if (!dependencyTicket) {
        throw new Error(`Dependency ticket ${dependencyTicketKey} not found.`);
      }

      const project = getProjectById(ticket.projectId);
      const dependencyProject = getProjectById(dependencyTicket.projectId);
      if (!project || !dependencyProject || project.workspaceId !== workspaceId || dependencyProject.workspaceId !== workspaceId) {
        throw new Error('Unauthorized or workspace mismatch');
      }

      upsertRelationPair(ticket, 'dependencies', dependencyTicket, 'blockers');
      const scope = getProjectScope(ticket.projectId);
      if (scope) {
        publishTicketEvent({
          workspaceId: scope.workspaceId,
          projectId: ticket.projectId,
          teamId: scope.teamId,
          ticketKey,
          actorUserId,
          type: 'dependency.added',
          data: { dependencyTicketKey },
        });
      }

      return { success: true };
    }

    case 'remove_dependency':
    case 'remove_ticket_dependency': {
      const ticketKey = String(args.ticketKey ?? '').toUpperCase();
      const dependencyTicketKey = String(args.dependencyTicketKey ?? args.dependencyKey ?? '').toUpperCase();
      const ticket = getTicketByKey(ticketKey);
      const dependencyTicket = getTicketByKey(dependencyTicketKey);

      if (!ticket) {
        throw new Error(`Ticket ${ticketKey} not found.`);
      }
      if (!dependencyTicket) {
        throw new Error(`Dependency ticket ${dependencyTicketKey} not found.`);
      }

      removeRelationPair(ticket, 'dependencies', dependencyTicket, 'blockers');
      const scope = getProjectScope(ticket.projectId);
      if (scope) {
        publishTicketEvent({
          workspaceId: scope.workspaceId,
          projectId: ticket.projectId,
          teamId: scope.teamId,
          ticketKey,
          actorUserId,
          type: 'dependency.removed',
          data: { dependencyTicketKey },
        });
      }

      return { success: true };
    }

    case 'read_comments': {
      const ticketKey = String(args.ticketKey ?? '').toUpperCase();
      const ticket = getTicketByKey(ticketKey);
      if (!ticket) {
        throw new Error(`Ticket ${ticketKey} not found.`);
      }
      return { comments: resolveTicketComments(ticket.id) };
    }

    default:
      throw new Error(`Unknown MCP tool: ${toolName}`);
  }
}

async function handleMockMcpTransport(url: URL, body: any, init?: RequestInit) {
  const workspaceId = normalizeText(
    getHeader(init, 'x-workspace-id') ?? body?.params?.workspaceId ?? url.searchParams.get('workspaceId') ?? '',
  );
  const actorUserId = resolveCurrentUserId(init, body);

  if (!workspaceId) {
    return jsonResponse(400, { error: 'X-Workspace-Id header or params.workspaceId is required.' });
  }

  if (!actorUserId) {
    return jsonResponse(401, { error: 'Authentication required.' });
  }

  if (!isWorkspaceMember(workspaceId, actorUserId)) {
    return jsonResponse(403, { error: 'Unauthorized workspace access.' });
  }

  if (body?.method === 'initialize') {
    return jsonResponse(200, {
      jsonrpc: '2.0',
      id: body.id ?? null,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'gravity-mock', version: '1.0.0' },
        capabilities: { tools: {} },
      },
    });
  }

  if (body?.method === 'tools/list') {
    const result = await executeMockMcpTool(workspaceId, actorUserId, 'tools/list', {});
    return jsonResponse(200, {
      jsonrpc: '2.0',
      id: body.id ?? null,
      result,
    });
  }

  if (body?.method === 'tools/call') {
    const toolName = normalizeText(body?.params?.name);
    if (!toolName) {
      return jsonResponse(200, {
        jsonrpc: '2.0',
        id: body.id ?? null,
        error: { code: -32602, message: 'Tool name is required.' },
      });
    }

    const rawArgs = body?.params?.arguments ?? {};
    const args = typeof rawArgs === 'string'
      ? (() => {
          try {
            return JSON.parse(rawArgs);
          } catch {
            return {};
          }
        })()
      : rawArgs;

    try {
      const result = await executeMockMcpTool(workspaceId, actorUserId, toolName, args);
      return jsonResponse(200, {
        jsonrpc: '2.0',
        id: body.id ?? null,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        },
      });
    } catch (error) {
      return jsonResponse(200, {
        jsonrpc: '2.0',
        id: body.id ?? null,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      });
    }
  }

  return jsonResponse(200, {
    jsonrpc: '2.0',
    id: body?.id ?? null,
    error: {
      code: -32601,
      message: 'Method not found',
    },
  });
}

function maybeHandleWorkspaceEventsSubscribe(url: URL, init?: RequestInit) {
  const workspaceId = normalizeText(getHeader(init, 'x-workspace-id') ?? url.searchParams.get('workspaceId') ?? '');
  if (!workspaceId) {
    return jsonResponse(400, { error: 'workspaceId query parameter is required.' });
  }

  const actorUserId = resolveCurrentUserId(init, null);
  if (!actorUserId) {
    return jsonResponse(401, { error: 'Authentication required.' });
  }

  if (!isWorkspaceMember(workspaceId, actorUserId)) {
    return jsonResponse(403, { error: 'Access denied: not a member of the workspace.' });
  }

  return jsonResponse(200, { ok: true, workspaceId });
}

globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = parseUrl(input);
  const method = init?.method?.toUpperCase() || 'GET';
  const body = parseJsonBody(init);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const projectIdHeader = normalizeText(getHeader(init, 'x-project-id'));

  if (path === '/api/auth/session') {
    if (dbState.currentUser) {
      return jsonResponse(200, {
        session: { user: dbState.currentUser },
        user: dbState.currentUser,
      });
    }
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  if (path === '/api/auth/sign-up' && method === 'POST') {
    const name = normalizeText(body?.name) || 'New Member';
    const email = normalizeText(body?.email) || `${name.toLowerCase().replace(/\s+/g, '.')}@gravity.test`;
    dbState.currentUser = {
      id: `usr-${Date.now()}`,
      name,
      email,
      avatar: '',
      role: 'owner',
      tutorial_completed: 0,
    };
    dbState.accountSettings = {
      userId: dbState.currentUser.id,
      theme: 'dark',
      projectLayout: 'spacious',
      notificationsEnabled: true,
    };
    return jsonResponse(200, { user: dbState.currentUser });
  }

  if (path === '/api/auth/sign-in' && method === 'POST') {
    const email = normalizeText(body?.email) || 'member@gravity.test';
    const name = normalizeText(body?.name) || email.split('@')[0] || 'Member';
    dbState.currentUser = {
      id: `usr-${Date.now()}`,
      name,
      email,
      avatar: '',
      role: 'owner',
      tutorial_completed: 0,
    };
    dbState.accountSettings = {
      userId: dbState.currentUser.id,
      theme: 'dark',
      projectLayout: 'spacious',
      notificationsEnabled: true,
    };
    return jsonResponse(200, { user: dbState.currentUser });
  }

  if (path === '/api/auth/sign-out' && method === 'POST') {
    dbState.currentUser = null;
    return jsonResponse(200, { success: true });
  }

  if (path === '/api/v1/events/subscribe' && method === 'GET') {
    return maybeHandleWorkspaceEventsSubscribe(url, init);
  }

  if (path === '/api/v1/mcp/sse' && method === 'POST') {
    return handleMockMcpTransport(url, body, init);
  }

  if (path === '/api/v1/workspaces' && method === 'GET') {
    return jsonResponse(200, dbState.currentUser ? dbState.workspaces : []);
  }

  if (path === '/api/v1/workspaces' && method === 'POST') {
    const workspace = {
      id: `wsp-${Date.now()}`,
      name: normalizeText(body?.name) || 'Untitled Workspace',
      defaultProjectId: null,
      role: 'owner',
    };
    dbState.workspaces.push(workspace);
    if (dbState.currentUser) {
      addWorkspaceMember(workspace.id, dbState.currentUser.id, 'owner');
    }
    return jsonResponse(201, { workspace });
  }

  const workspaceSettingsMatch = path.match(/^\/api\/v1\/workspaces\/([^/]+)\/settings$/);
  if (workspaceSettingsMatch && method === 'GET') {
    return jsonResponse(200, {
      id: `set-${Date.now()}`,
      workspaceId: workspaceSettingsMatch[1],
      allowPeerInvites: true,
      requireJoinApproval: false,
    });
  }

  if (workspaceSettingsMatch && method === 'PATCH') {
    return jsonResponse(200, {
      id: `set-${Date.now()}`,
      workspaceId: workspaceSettingsMatch[1],
      allowPeerInvites: true,
      requireJoinApproval: false,
    });
  }

  const workspaceMembersMatch = path.match(/^\/api\/v1\/workspaces\/([^/]+)\/members$/);
  if (workspaceMembersMatch && method === 'GET') {
    return jsonResponse(200, buildMemberList(workspaceMembersMatch[1]));
  }

  if (path.includes('/peer-invites') && method === 'GET') {
    return jsonResponse(200, []);
  }

  if (path.includes('/join-requests') && method === 'GET') {
    return jsonResponse(200, []);
  }

  if (path.includes('/federation/connections') && method === 'GET') {
    return jsonResponse(200, []);
  }

  if (path.startsWith('/api/v1/settings/') && method === 'GET') {
    return jsonResponse(200, dbState.accountSettings || {});
  }

  if (path.startsWith('/api/v1/settings/') && method === 'PATCH') {
    if (dbState.accountSettings) {
      dbState.accountSettings = { ...dbState.accountSettings, ...body };
    }
    return jsonResponse(200, dbState.accountSettings || {});
  }

  if (path.includes('/tutorial') && method === 'PATCH') {
    dbState.tutorialCompleted = Boolean(body?.completed);
    return jsonResponse(200, { success: true });
  }

  if (path.includes('/api/v1/ai/ollama/models')) {
    return jsonResponse(200, {
      connected: true,
      models: [{ name: 'llama3:latest' }, { name: 'mistral:latest' }],
    });
  }

  if (path === '/api/v1/projects' && method === 'GET') {
    return jsonResponse(200, dbState.projects);
  }

  if (path === '/api/v1/projects' && method === 'POST') {
    const project = {
      id: `prj-${Date.now()}`,
      workspaceId: normalizeText(body?.workspaceId) || dbState.workspaces[0]?.id || '',
      name: normalizeText(body?.name) || 'Untitled Project',
      key: normalizeText(body?.key) || 'GRV',
      teamId: body?.teamId ?? null,
    };
    dbState.projects.push(project);
    const workspace = dbState.workspaces.find((item) => item.id === project.workspaceId);
    if (workspace && !workspace.defaultProjectId) {
      workspace.defaultProjectId = project.id;
    }
    return jsonResponse(201, project);
  }

  const projectMutationMatch = path.match(/^\/api\/v1\/projects\/([^/]+)$/);
  if (projectMutationMatch && method === 'PATCH') {
    const project = getProjectById(projectMutationMatch[1]);
    if (!project) {
      return jsonResponse(404, { error: 'Project not found' });
    }
    Object.assign(project, body ?? {});
    return jsonResponse(200, project);
  }

  if (projectMutationMatch && method === 'DELETE') {
    const projectIndex = dbState.projects.findIndex((project) => project.id === projectMutationMatch[1]);
    if (projectIndex === -1) {
      return jsonResponse(404, { error: 'Project not found' });
    }
    dbState.projects.splice(projectIndex, 1);
    return jsonResponse(200, { success: true });
  }

  if (path === '/api/v1/labels' && method === 'GET') {
    const projectId = projectIdHeader || normalizeText(url.searchParams.get('projectId'));
    const labels = projectId
      ? dbState.labels.filter((label) => label.projectId === projectId)
      : dbState.labels;
    return jsonResponse(200, labels);
  }

  if (path === '/api/v1/labels' && method === 'POST') {
    const label = {
      id: `lbl-${Date.now()}`,
      projectId: body?.projectId ?? null,
      teamId: body?.teamId ?? null,
      name: normalizeText(body?.name) || 'Label',
      color: normalizeText(body?.color) || '#6B7280',
      description: normalizeText(body?.description) || '',
      sortOrder: Number.isFinite(Number(body?.sortOrder)) ? Number(body.sortOrder) : 0,
    };
    dbState.labels.push(label);
    return jsonResponse(201, label);
  }

  if (path === '/api/v1/cycles' && method === 'GET') {
    const projectId = projectIdHeader || normalizeText(url.searchParams.get('projectId'));
    const cycles = projectId
      ? dbState.cycles.filter((cycle) => cycle.projectId === projectId)
      : dbState.cycles;
    return jsonResponse(200, cycles);
  }

  if (path === '/api/v1/users' && method === 'GET') {
    return jsonResponse(200, dbState.currentUser ? [dbState.currentUser] : []);
  }

  const ticketCommentsMatch = path.match(/^\/api\/v1\/tickets\/([^/]+)\/comments$/);
  if (ticketCommentsMatch && method === 'GET') {
    const ticket = getTicketById(ticketCommentsMatch[1]);
    if (!ticket) {
      return jsonResponse(404, { error: 'Ticket not found' });
    }
    return jsonResponse(200, resolveTicketComments(ticket.id));
  }

  if (ticketCommentsMatch && method === 'POST') {
    const ticket = getTicketById(ticketCommentsMatch[1]);
    if (!ticket) {
      return jsonResponse(404, { error: 'Ticket not found' });
    }

    const commentBody = normalizeText(body?.content ?? body?.body);
    if (!commentBody) {
      return jsonResponse(400, { error: 'Comment body is required.' });
    }

    const comment = {
      id: `cmt-${Date.now()}`,
      ticketId: ticket.id,
      body: commentBody,
      userId: dbState.currentUser?.id || 'anonymous',
      createdAt: new Date().toISOString(),
      userName: dbState.currentUser?.name ?? 'Member',
      userAvatar: dbState.currentUser?.avatar ?? '',
    };
    dbState.comments.push(comment);
    return jsonResponse(201, serializeComment(comment));
  }

  const ticketCommentMutationMatch = path.match(/^\/api\/v1\/tickets\/([^/]+)\/comments\/([^/]+)$/);
  if (ticketCommentMutationMatch && method === 'PATCH') {
    const ticket = getTicketById(ticketCommentMutationMatch[1]);
    if (!ticket) {
      return jsonResponse(404, { error: 'Ticket not found' });
    }

    const comment = dbState.comments.find((entry) => entry.id === ticketCommentMutationMatch[2] && entry.ticketId === ticket.id);
    if (!comment) {
      return jsonResponse(404, { error: 'Comment not found' });
    }

    const commentBody = normalizeText(body?.content ?? body?.body);
    if (!commentBody) {
      return jsonResponse(400, { error: 'Comment body is required.' });
    }

    comment.body = commentBody;
    return jsonResponse(200, serializeComment(comment));
  }

  if (ticketCommentMutationMatch && method === 'DELETE') {
    const ticket = getTicketById(ticketCommentMutationMatch[1]);
    if (!ticket) {
      return jsonResponse(404, { error: 'Ticket not found' });
    }

    const before = dbState.comments.length;
    dbState.comments = dbState.comments.filter((comment) => !(comment.id === ticketCommentMutationMatch[2] && comment.ticketId === ticket.id));
    return jsonResponse(200, { success: dbState.comments.length !== before });
  }

  const ticketLabelsMatch = path.match(/^\/api\/v1\/tickets\/([^/]+)\/labels$/);
  if (ticketLabelsMatch && method === 'POST') {
    const ticket = getTicketById(ticketLabelsMatch[1]);
    if (!ticket) {
      return jsonResponse(404, { error: 'Ticket not found' });
    }
    const labelId = normalizeText(body?.labelId);
    const label = getLabelById(labelId);
    if (!label) {
      return jsonResponse(404, { error: 'Label not found' });
    }
    ticket.labels = ticket.labels ?? [];
    ticket.labelIds = ticket.labelIds ?? [];
    if (!ticket.labelIds.includes(labelId)) {
      ticket.labelIds.push(labelId);
    }
    if (!ticket.labels.some((entry) => entry.id === label.id)) {
      ticket.labels.push({ ...label });
    }
    ticket.updatedAt = new Date().toISOString();
    return jsonResponse(200, { success: true });
  }

  const ticketLabelMutationMatch = path.match(/^\/api\/v1\/tickets\/([^/]+)\/labels\/([^/]+)$/);
  if (ticketLabelMutationMatch && method === 'DELETE') {
    const ticket = getTicketById(ticketLabelMutationMatch[1]);
    if (!ticket) {
      return jsonResponse(404, { error: 'Ticket not found' });
    }

    ticket.labelIds = (ticket.labelIds ?? []).filter((labelId) => labelId !== ticketLabelMutationMatch[2]);
    ticket.labels = (ticket.labels ?? []).filter((label) => label.id !== ticketLabelMutationMatch[2]);
    ticket.updatedAt = new Date().toISOString();
    return jsonResponse(200, { success: true });
  }

  const ticketDependenciesMatch = path.match(/^\/api\/v1\/tickets\/([^/]+)\/dependencies$/);
  if (ticketDependenciesMatch && method === 'POST') {
    const ticket = getTicketById(ticketDependenciesMatch[1]);
    if (!ticket) {
      return jsonResponse(404, { error: 'Ticket not found' });
    }
    const dependencyTicket = getTicketById(String(body?.dependencyId ?? ''));
    if (!dependencyTicket) {
      return jsonResponse(404, { error: 'Dependency ticket not found' });
    }
    upsertRelationPair(ticket, 'dependencies', dependencyTicket, 'blockers');
    return jsonResponse(200, { success: true });
  }

  const ticketDependencyMutationMatch = path.match(/^\/api\/v1\/tickets\/([^/]+)\/dependencies\/([^/]+)$/);
  if (ticketDependencyMutationMatch && method === 'DELETE') {
    const ticket = getTicketById(ticketDependencyMutationMatch[1]);
    const dependencyTicket = getTicketById(ticketDependencyMutationMatch[2]);
    if (!ticket || !dependencyTicket) {
      return jsonResponse(404, { error: 'Ticket not found' });
    }
    removeRelationPair(ticket, 'dependencies', dependencyTicket, 'blockers');
    return jsonResponse(200, { success: true });
  }

  const ticketBlockersMatch = path.match(/^\/api\/v1\/tickets\/([^/]+)\/blockers$/);
  if (ticketBlockersMatch && method === 'POST') {
    const ticket = getTicketById(ticketBlockersMatch[1]);
    if (!ticket) {
      return jsonResponse(404, { error: 'Ticket not found' });
    }
    const blockerTicket = getTicketById(String(body?.blockerId ?? ''));
    if (!blockerTicket) {
      return jsonResponse(404, { error: 'Blocker ticket not found' });
    }
    upsertRelationPair(ticket, 'blockers', blockerTicket, 'dependencies');
    return jsonResponse(200, { success: true });
  }

  const ticketBlockerMutationMatch = path.match(/^\/api\/v1\/tickets\/([^/]+)\/blockers\/([^/]+)$/);
  if (ticketBlockerMutationMatch && method === 'DELETE') {
    const ticket = getTicketById(ticketBlockerMutationMatch[1]);
    const blockerTicket = getTicketById(ticketBlockerMutationMatch[2]);
    if (!ticket || !blockerTicket) {
      return jsonResponse(404, { error: 'Ticket not found' });
    }
    removeRelationPair(ticket, 'blockers', blockerTicket, 'dependencies');
    return jsonResponse(200, { success: true });
  }

  const ticketByIdMatch = path.match(/^\/api\/v1\/tickets\/([^/]+)$/);
  if (ticketByIdMatch && method === 'GET') {
    const ticket = getTicketById(ticketByIdMatch[1]);
    if (!ticket) {
      return jsonResponse(404, { error: 'Ticket not found' });
    }
    return jsonResponse(200, serializeTicket(ticket));
  }

  if (ticketByIdMatch && method === 'PATCH') {
    const ticket = getTicketById(ticketByIdMatch[1]);
    if (!ticket) {
      return jsonResponse(404, { error: 'Ticket not found' });
    }

    if (typeof body?.title === 'string') {
      ticket.title = body.title;
    }
    if (typeof body?.description === 'string') {
      ticket.description = body.description;
    }
    if (typeof body?.status === 'string') {
      ticket.status = canonicalizeStatus(body.status);
    }
    if (typeof body?.priority === 'string') {
      ticket.priority = canonicalizePriority(body.priority);
    }
    if (typeof body?.assigneeId === 'string') {
      ticket.assigneeId = body.assigneeId;
    }
    if (typeof body?.cycleId === 'string') {
      ticket.cycleId = body.cycleId;
    }
    if (typeof body?.parentId === 'string') {
      ticket.parentId = body.parentId;
    }
    if (typeof body?.prStatus === 'string') {
      ticket.prStatus = body.prStatus;
    }
    if (typeof body?.prUrl === 'string') {
      ticket.prUrl = body.prUrl;
    }
    if (Array.isArray(body?.labelIds)) {
      ticket.labelIds = body.labelIds.map((labelId: unknown) => String(labelId));
      ticket.labels = ticket.labelIds
        .map((labelId) => getLabelById(labelId))
        .filter((label): label is MockLabel => Boolean(label))
        .map((label) => ({ ...label }));
    }
    if (typeof body?.labels === 'string' || Array.isArray(body?.labels)) {
      setTicketLabelsByNames(ticket, resolveLabelNames(body.labels));
    }

    ticket.updatedAt = new Date().toISOString();
    ensureTicketRelations(ticket);
    return jsonResponse(200, serializeTicket(ticket));
  }

  if (ticketByIdMatch && method === 'DELETE') {
    const ticket = getTicketById(ticketByIdMatch[1]);
    if (!ticket) {
      return jsonResponse(404, { error: 'Ticket not found' });
    }

    dbState.tickets = dbState.tickets.filter((entry) => entry.id !== ticket.id);
    dbState.comments = dbState.comments.filter((comment) => comment.ticketId !== ticket.id);
    removeTicketFromRelations(ticket.id);
    return jsonResponse(200, { success: true });
  }

  if (path === '/api/v1/tickets' && method === 'GET') {
    const projectId = projectIdHeader || normalizeText(url.searchParams.get('projectId'));
    const tickets = projectId
      ? dbState.tickets.filter((ticket) => ticket.projectId === projectId)
      : dbState.tickets;
    return jsonResponse(200, tickets.map(serializeTicket));
  }

  if (path === '/api/v1/tickets' && method === 'POST') {
    const projectId = normalizeText(body?.projectId) || projectIdHeader || dbState.projects[0]?.id || '';
    const project = getProjectById(projectId);
    if (!project) {
      return jsonResponse(404, { error: 'Project not found' });
    }

    const ticket = buildTicketRecordFromBody(body, projectId);
    if (!ticket.key || ticket.key === 'GRV-0') {
      ticket.key = nextTicketKey(projectId);
    }
    dbState.tickets.push(ticket);
    return jsonResponse(201, serializeTicket(ticket));
  }

  return jsonResponse(404, { error: 'Mock endpoint not found' });
}) as any;

beforeEach(() => {
  resetMockDb();
  const fetchMock = globalThis.fetch as unknown as { mockClear?: () => void };
  fetchMock.mockClear?.();
});

afterEach(() => {
  cleanup();
  resetMockSseRegistry();
});

export function resetMockDb() {
  dbState = {
    currentUser: null,
    tutorialCompleted: false,
    workspaces: [],
    workspaceMembers: [],
    projects: [],
    tickets: [],
    labels: [],
    cycles: [],
    comments: [],
    accountSettings: null,
  };
  resetMockSseRegistry();
}
