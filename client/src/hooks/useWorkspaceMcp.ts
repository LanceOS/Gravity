import { apiClient } from '../utils/apiClient';
import { useMemo } from 'react';
import type { McpConnection, McpConnectionPayload } from '../utils/mcp';

export function useWorkspaceMcp(workspaceId?: string) {
  return useMemo(() => {
    async function createConnection(options: { scopes?: string[]; ttlSeconds?: number; singleUse?: boolean; bindToIp?: boolean } = {}) {
      if (!workspaceId) throw new Error('workspaceId is required');
      const data = await apiClient.post<McpConnectionPayload>(`/workspaces/${encodeURIComponent(workspaceId)}/mcp/connection`, options, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!data) {
        throw new Error('Failed to create connection token');
      }
      return data;
    }

    async function revokeConnection(tokenId: string) {
      if (!workspaceId) throw new Error('workspaceId is required');
      const data = await apiClient.post<Record<string, unknown>>(`/workspaces/${encodeURIComponent(workspaceId)}/mcp/connection/${encodeURIComponent(tokenId)}/revoke`, {}, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!data) {
        throw new Error('Failed to revoke connection token');
      }
      return data;
    }

    async function listConnections(signal?: AbortSignal) {
      if (!workspaceId) throw new Error('workspaceId is required');
      return apiClient.get<McpConnection[]>(`/workspaces/${encodeURIComponent(workspaceId)}/mcp/connections`, { signal });
    }

    return { createConnection, revokeConnection, listConnections };
  }, [workspaceId]);
}

export default useWorkspaceMcp;
