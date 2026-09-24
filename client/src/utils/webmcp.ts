import { callMcpTool, type McpTool, type McpToolResult } from './mcp';

export interface BrowserMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: McpTool['annotations'];
  execute: (args: Record<string, unknown>, options?: { signal: AbortSignal }) => Promise<McpToolResult>;
}

interface BrowserModelContext {
  registerTool: (tool: BrowserMcpTool, options: { signal: AbortSignal }) => Promise<void> | void;
  unregisterTool?: (name: string) => void;
}

export interface WebMcpRegistration {
  dispose: () => void;
  ready: Promise<void>;
}

function getModelContext(): BrowserModelContext | undefined {
  if (typeof document === 'undefined') return undefined;
  return (document as Document & { modelContext?: BrowserModelContext }).modelContext;
}

export function supportsWebMcpRegistration() {
  const context = getModelContext();
  return typeof context?.registerTool === 'function';
}

/** Register only server-discovered tools and route execution through server policy. */
export function registerWebMCPTools(workspaceId: string, tools: McpTool[]): WebMcpRegistration {
  const context = getModelContext();
  if (!supportsWebMcpRegistration() || !context) return { dispose: () => {}, ready: Promise.resolve() };
  const registered: string[] = [];
  const controller = new AbortController();
  const cleanup = () => {
    controller.abort();
    for (const name of registered.splice(0)) {
      // Older implementations expose an explicit method; current drafts use the signal.
      try { context.unregisterTool?.(name); }
      catch (error) {
        if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
          console.error(`Gravity: could not unregister WebMCP tool ${name}`, error);
        }
      }
    }
  };
  const ready = (async () => {
    for (const tool of tools) {
      if (controller.signal.aborted) return;
      const registration = context.registerTool({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.annotations?.readOnlyHint === true,
          consequentialHint: tool.annotations?.destructiveHint === true,
          untrustedContentHint: true,
        },
        execute: async (args, options) => {
          if (controller.signal.aborted) throw new Error('This workspace tool is no longer available.');
          // Return the server's result, including isError, only after execution finishes.
          const signal = options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
          return callMcpTool(workspaceId, tool.name, args, signal);
        },
      }, { signal: controller.signal });
      // Current browsers reject the registration promise for invalid tools or
      // permissions. Older synchronous implementations return undefined.
      if (registration) await registration;
      if (controller.signal.aborted) return;
      registered.push(tool.name);
    }
  })().catch(error => {
    cleanup();
    throw error;
  });
  // Disposal must be available while the first registration is still pending.
  return { dispose: cleanup, ready };
}
