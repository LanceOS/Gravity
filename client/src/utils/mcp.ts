import { apiClient } from './apiClient';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; [key: string]: unknown };
  aliases?: string[];
  policyParents?: string[];
  permission?: string;
  scope?: string;
  allowedForConnection?: boolean;
}

export interface McpConnection {
  id: string;
  scopes: string[];
  status: string;
  expiresAt: string | null;
  revokedAt?: string | null;
  generatedBy?: string;
}

export interface McpConnectionPayload {
  id: string;
  scopes: string[];
  args: { mcpEndpoint: string; workspaceId: string; transport?: string };
  auth: { token: string; expiresAt: string; singleUse: boolean };
}

export interface McpOAuthSetup {
  mcpEndpoint: string;
  oauthEnabled: boolean;
  message?: string;
}

export async function getMcpOAuthSetup(workspaceId: string, signal?: AbortSignal): Promise<McpOAuthSetup> {
  const setup = await apiClient.get<McpOAuthSetup>(`/workspaces/${encodeURIComponent(workspaceId)}/mcp/setup`, { signal });
  if (!setup?.oauthEnabled) throw new Error(setup?.message || 'OAuth sign-in is not enabled on this Gravity server.');
  if (typeof setup.mcpEndpoint !== 'string' || !setup.mcpEndpoint) throw new Error('The server did not return an MCP server URL.');
  return setup;
}

export interface McpToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export async function requestMcp<T>(workspaceId: string, method: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  if (!workspaceId) throw new Error('A workspace is required.');
  const response = await apiClient.post<{ result?: T; error?: { message: string } }>('/mcp', {
    jsonrpc: '2.0', id: crypto.randomUUID(), method, params,
  }, { headers: { 'X-Workspace-Id': workspaceId }, credentials: 'same-origin', signal });
  if (response?.error) throw new Error(response.error.message);
  if (!response || response.result === undefined) throw new Error('The MCP server returned an invalid response.');
  return response.result;
}

export async function listMcpTools(workspaceId: string, signal?: AbortSignal): Promise<McpTool[]> {
  const result = await requestMcp<{ tools: McpTool[] }>(workspaceId, 'tools/list', {}, signal);
  if (!Array.isArray(result.tools)) throw new Error('The MCP server returned an invalid tool list.');
  return result.tools;
}

export async function callMcpTool(workspaceId: string, name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpToolResult> {
  return requestMcp<McpToolResult>(workspaceId, 'tools/call', { name, arguments: args }, signal);
}

export function buildMcpClientConfig(connection: McpConnectionPayload) {
  return {
    mcpServers: {
      gravity: {
        url: connection.args.mcpEndpoint,
        headers: {
          Authorization: `Bearer ${connection.auth.token}`,
          'X-Workspace-Id': connection.args.workspaceId,
        },
      },
    },
  };
}

export interface McpConnectionField {
  id: string;
  label: string;
  value: string;
  hint?: string;
  secret?: boolean;
}

/** Setup values for clients that support bearer credentials and custom headers. */
export function buildMcpConnectionFields(connection: McpConnectionPayload): McpConnectionField[] {
  const config = buildMcpClientConfig(connection).mcpServers.gravity;
  return [
    { id: 'endpoint', label: 'MCP server URL', value: config.url },
    { id: 'transport', label: 'Transport', value: 'Streamable HTTP' },
    { id: 'token', label: 'Bearer token', value: connection.auth.token, secret: true, hint: 'For a bearer-token field, paste this token without the Bearer prefix.' },
    { id: 'authorization', label: 'Authorization header value', value: config.headers.Authorization, secret: true, hint: 'Header name: Authorization' },
    { id: 'workspace', label: 'Workspace ID', value: config.headers['X-Workspace-Id'], hint: 'Header name: X-Workspace-Id' },
  ];
}

export const mcpToolLabel = (name: string) => name.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
