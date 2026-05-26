import type { AgentLogEntry } from '../types/AgentSimulator';

export function delay(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export function getInitialAgentLogs(): AgentLogEntry[] {
  return [
    { type: 'info', text: '🤖 Gravity MCP Agent Session Initialized.' },
    {
      type: 'info',
      text: 'This simulator makes real JSON-RPC calls to the backend MCP tools (/api/v1/mcp/sse) to show how an external IDE Agent (e.g. VSCode Copilot) modifies Gravity.',
    },
  ];
}