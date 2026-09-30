import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspect } from 'node:util';

const files = vi.hoisted(() => new Map<string, string>());
// Never read a developer's .env file or connect to application dependencies.
vi.mock('fs', () => ({
  existsSync: (path: string) => files.has(path),
  readFileSync: (path: string) => files.get(path),
}));

beforeEach(() => {
  vi.resetModules();
  files.clear();
  vi.stubGlobal('process', {
    cwd: () => '/isolated/server',
    env: {
      DATABASE_URL: 'postgresql://unused/unused',
      BETTER_AUTH_SECRET: 'test-secret',
      NODE_IDENTITY_MASTER_KEY: 'test-key',
      LOCAL_TESTING_KEK: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('retired MCP agent command', () => {
  it.each([undefined, '', ' \t\n '])('accepts an unset or blank setting: %j', async (value) => {
    if (value !== undefined) process.env.MCP_AGENT_COMMAND = value;
    const { env } = await import('../src/env.js');
    expect(env).not.toHaveProperty('mcpAgentCommand');
  });

  it.each([
    '/usr/local/bin/agent',
    'node agent.js',
    'agent; touch /tmp/grav-8-marker',
    'agent && echo secret',
    '$(echo secret)',
    '`echo secret`',
    'agent\necho secret',
  ])('rejects every non-empty command before startup: %j', async (value) => {
    process.env.MCP_AGENT_COMMAND = value;
    await expect(import('../src/env.js')).rejects.toThrow('MCP_AGENT_COMMAND is no longer supported');
  });

  it.each(['/isolated/.env', '/isolated/server/.env'])(
    'rejects a legacy command loaded from %s without echoing it', async (path) => {
      files.set(path, 'MCP_AGENT_COMMAND="agent --token=private-token"');
      const error = await import('../src/env.js').catch((error: Error) => error);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain('Unset it and run the MCP stdio entrypoint separately');
      expect(String(error)).not.toContain('private-token');
      expect(inspect(error)).not.toContain('private-token');
    },
  );

  it('allows operators to clear a stale file setting through the process environment', async () => {
    files.set('/isolated/.env', 'MCP_AGENT_COMMAND=legacy-agent');
    files.set('/isolated/server/.env', 'MCP_AGENT_COMMAND=another-agent');
    process.env.MCP_AGENT_COMMAND = '';
    const { env } = await import('../src/env.js');
    expect(env).not.toHaveProperty('mcpAgentCommand');
  });

  it('honors a server environment file clearing the root legacy setting', async () => {
    files.set('/isolated/.env', 'MCP_AGENT_COMMAND=legacy-agent');
    files.set('/isolated/server/.env', 'MCP_AGENT_COMMAND=');
    const { env } = await import('../src/env.js');
    expect(env).not.toHaveProperty('mcpAgentCommand');
  });

  it('preserves the standalone stdio identity configuration', async () => {
    process.env.MCP_STDIO_WORKSPACE_ID = ' workspace-id ';
    process.env.MCP_STDIO_ACTOR_USER_ID = ' actor-id ';
    const { env } = await import('../src/env.js');
    expect(env.mcpStdioWorkspaceId).toBe('workspace-id');
    expect(env.mcpStdioActorUserId).toBe('actor-id');
  });
});
