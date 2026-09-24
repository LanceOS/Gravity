import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceSummary } from '../../../hooks/useWorkspaceDirectory';
import { apiClient, ApiError } from '../../../utils/apiClient';
import type { McpConnection } from '../../../utils/mcp';

export interface AccountMcpConnection extends McpConnection {
  workspaceId: string;
  workspaceName: string;
  workspaceKey: string;
  workspaceRole: string;
  createdAt?: string | null;
  connectionType?: string;
  clientName?: string | null;
}

export function useAccountMcpConnections() {
  const [connections, setConnections] = useState<AccountMcpConnection[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    if (!mounted.current) return;
    const version = ++requestVersion.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError(null);
    try {
      const [nextConnections, nextWorkspaces] = await Promise.all([
        apiClient.get<AccountMcpConnection[]>('/users/me/mcp/connections', { signal: controller.signal }),
        apiClient.get<WorkspaceSummary[]>('/workspaces', { signal: controller.signal }),
      ]);
      if (version !== requestVersion.current) return;
      if (!Array.isArray(nextConnections) || !Array.isArray(nextWorkspaces)) {
        throw new Error('Unable to load your connections. Please try again.');
      }
      setConnections(nextConnections);
      setWorkspaces(nextWorkspaces);
    } catch (loadError) {
      if (version !== requestVersion.current) return;
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your connections.');
      // Never leave a previous account/workspace inventory visible after access changes.
      setConnections([]);
      setWorkspaces([]);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      activeRequest.current?.abort();
    };
  }, [refresh]);

  return { connections, workspaces, loading, error, refresh };
}

export async function revokeAccountMcpConnection(connection: AccountMcpConnection) {
  await apiClient.post(
    `/workspaces/${encodeURIComponent(connection.workspaceId)}/mcp/connection/${encodeURIComponent(connection.id)}/revoke`,
    {},
  );
}

export function accountConnectionError(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    const delay = error.data?.retryAfterSeconds;
    if (typeof delay === 'number' && Number.isFinite(delay) && delay > 0) {
      const seconds = Math.ceil(delay);
      return `Too many connection requests. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`;
    }
    return 'Too many connection requests. Please wait before trying again.';
  }
  return error instanceof Error ? error.message : 'Unable to revoke the connection.';
}
