import { toolHandlers } from './tool-handlers/registry.js';
import { audit } from '../../lib/logger.js';
import { assertToolExecutionAllowed } from './policy.js';
import { getToolDefinition } from './tools.js';
import { validateToolArguments } from './validation.js';
import { McpToolError } from './errors.js';

/**
 * @description Resolves a tool name against the registry and executes it with
 * the trusted workspace and actor context assembled by the
 * transport/handler pipeline.
 * @param name The MCP tool name requested by the client.
 * @param args Tool arguments from the JSON-RPC payload.
 * @param contextWorkspaceId Trusted workspace id for execution.
 * @param actorUserId Trusted actor id for execution.
 * @return The tool result returned by the registered handler.
 * @throws When the requested tool is not registered.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  contextWorkspaceId: string,
  actorUserId: string,
  options: { tokenScopes?: string[] } = {},
) {
  const definition = getToolDefinition(name);
  const handler = Object.hasOwn(toolHandlers, name) ? toolHandlers[name] : undefined;
  if (!handler || !definition) {
    throw new McpToolError(`Unknown tool: ${name}`, -32602);
  }
  validateToolArguments(definition, args);
  await assertToolExecutionAllowed(name, args, contextWorkspaceId, actorUserId, options);

  audit('mcp.tool_execute', {
    toolName: name,
    workspaceId: contextWorkspaceId,
    actorUserId,
    // Values can contain rich text or other private user content. Record the
    // operation's shape without copying that content into the audit log.
    argumentNames: Object.keys(args).sort(),
  });

  return handler(args, {
    workspaceId: contextWorkspaceId,
    actorUserId,
  });
}
