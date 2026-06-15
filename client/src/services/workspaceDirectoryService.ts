import { ApiError, apiClient } from '../utils/apiClient';
import type { CreateWorkspaceInput, WorkspaceSummary } from '../hooks/useWorkspaceDirectory';

type WorkspaceCreateResponse = {
  workspace?: WorkspaceSummary;
} | WorkspaceSummary;

type WorkspaceActivityResponse = {
  success: boolean;
  lastActiveAt?: string | null;
};

export interface WorkspaceDirectoryService {
  listWorkspaces(userId: string): Promise<WorkspaceSummary[]>;
  createWorkspace(ownerId: string, input: CreateWorkspaceInput): Promise<WorkspaceSummary>;
  requestJoinByInvite(userId: string, inviteCode: string, message?: string): Promise<void>;
  logWorkspaceMemberActivity(workspaceId: string, userId: string): Promise<string | null>;
}

function normalizeWorkspaceCreateResponse(data: unknown): WorkspaceSummary {
  if (isWorkspace(data)) {
    return data;
  }

  if (typeof data === 'object' && data !== null && isWorkspace((data as { workspace?: unknown }).workspace)) {
    return (data as { workspace: WorkspaceSummary }).workspace;
  }

  throw new ApiError(500, 'Invalid workspace create response.');
}

function isWorkspace(value: unknown): value is WorkspaceSummary {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const typedValue = value as { id?: unknown; name?: unknown; key?: unknown };
  return (
    typeof typedValue.id === 'string' &&
    typeof typedValue.name === 'string' &&
    typeof typedValue.key === 'string'
  );
}

export class DefaultWorkspaceDirectoryService implements WorkspaceDirectoryService {
  constructor(private readonly client = apiClient) {}

  async listWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
    const data = await this.client.get<WorkspaceSummary[] | { error?: string }>('/workspaces', {
      headers: { 'X-User-Id': userId },
    });
    return Array.isArray(data) ? data : [];
  }

  async createWorkspace(ownerId: string, input: CreateWorkspaceInput): Promise<WorkspaceSummary> {
    const data = await this.client.post<WorkspaceCreateResponse>('/workspaces', {
      ...input,
      ownerId,
    }, {
      headers: { 'Content-Type': 'application/json', 'X-User-Id': ownerId },
    });

    return normalizeWorkspaceCreateResponse(data);
  }

  async requestJoinByInvite(userId: string, inviteCode: string, message?: string): Promise<void> {
    await this.client.post<{ success: boolean }>('/workspaces/invites/' + encodeURIComponent(inviteCode) + '/join-requests', {
      userId,
      message: message || '',
    }, {
      headers: { 'Content-Type': 'application/json', },
    });
  }

  async logWorkspaceMemberActivity(workspaceId: string, userId: string): Promise<string | null> {
    const data = await this.client.post<WorkspaceActivityResponse>(
      `/workspaces/${workspaceId}/members/${userId}/activity`,
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
      }
    );
    return data?.success && data.lastActiveAt ? data.lastActiveAt : null;
  }
}

export const workspaceDirectoryService = new DefaultWorkspaceDirectoryService();
