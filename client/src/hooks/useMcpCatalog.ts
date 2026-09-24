import { useEffect, useState } from 'react';
import { apiClient } from '../utils/apiClient';
import type { McpTool } from '../utils/mcp';

const EMPTY_TOOLS: McpTool[] = [];

/** Full registry metadata, including tools disabled in workspace settings. */
export function useMcpCatalog(workspaceId?: string, enabled = true) {
  const [state, setState] = useState<{ workspaceId?: string; tools: McpTool[]; loading: boolean; error: string | null }>({ tools: [], loading: false, error: null });
  useEffect(() => {
    if (!workspaceId || !enabled) return;
    const controller = new AbortController();
    setState({ workspaceId, tools: [], loading: true, error: null });
    void apiClient.get<{ tools: McpTool[] }>(`/workspaces/${encodeURIComponent(workspaceId)}/mcp/tools`, { signal: controller.signal })
      .then(data => {
        if (!Array.isArray(data?.tools)) throw new Error('The server returned an invalid tool catalog.');
        if (!controller.signal.aborted) setState({ workspaceId, tools: data.tools, loading: false, error: null });
      })
      .catch(error => {
        if (!controller.signal.aborted) setState({ workspaceId, tools: [], loading: false, error: error instanceof Error ? error.message : 'Unable to load MCP tools.' });
      });
    return () => controller.abort();
  }, [workspaceId, enabled]);
  return enabled && workspaceId && state.workspaceId === workspaceId
    ? state
    : { tools: EMPTY_TOOLS, loading: Boolean(enabled && workspaceId), error: null };
}
