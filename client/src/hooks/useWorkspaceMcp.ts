export function useWorkspaceMcp(workspaceId?: string) {
  async function createConnection(options: { scopes?: string[]; ttlSeconds?: number; singleUse?: boolean } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required');
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/mcp/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Failed to create connection token');
    }
    return await res.json();
  }

  async function revokeConnection(tokenId: string) {
    if (!workspaceId) throw new Error('workspaceId is required');
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/mcp/connection/${tokenId}/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Failed to revoke connection token');
    }
    return await res.json();
  }

  return { createConnection, revokeConnection };
}

export default useWorkspaceMcp;
