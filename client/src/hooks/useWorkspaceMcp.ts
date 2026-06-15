import { apiClient } from '../utils/apiClient';

export function useWorkspaceMcp(workspaceId?: string) {
  async function createConnection(options: { scopes?: string[]; ttlSeconds?: number; singleUse?: boolean } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required');
    const data = await apiClient.post<Record<string, unknown>>(`/workspaces/${workspaceId}/mcp/connection`, options, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!data) {
      throw new Error('Failed to create connection token');
    }
    return data;
  }

  async function revokeConnection(tokenId: string) {
    if (!workspaceId) throw new Error('workspaceId is required');
    const data = await apiClient.post<Record<string, unknown>>(`/workspaces/${workspaceId}/mcp/connection/${tokenId}/revoke`, {}, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!data) {
      throw new Error('Failed to revoke connection token');
    }
    return data;
  }

  return { createConnection, revokeConnection };
}

export default useWorkspaceMcp;
