import type { ToolHandler } from './types.js';

/**
 * @description Central registry used by the executor. Modules register their
 * handlers here dynamically at startup so the MCP core is not coupled to
 * specific domains.
 */
export const toolHandlers: Record<string, ToolHandler> = {};

export function registerToolHandlers(handlers: Record<string, ToolHandler>) {
  Object.assign(toolHandlers, handlers);
}
