import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../utils/apiClient';
import { registerWebMCPTools, supportsWebMcpRegistration, type BrowserMcpTool } from '../../utils/webmcp';
import { useWebMcpRegistration } from '../../modules/workspaceShellPage/hooks/useWebMcpRegistration';

const tools = [{ name: 'list_tickets', description: 'List tickets', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }];

function installModelContext() {
  const context = { registerTool: vi.fn<(tool: BrowserMcpTool, options: { signal: AbortSignal }) => Promise<void> | void>(), unregisterTool: vi.fn() };
  Object.defineProperty(document, 'modelContext', { configurable: true, value: context });
  return context;
}

afterEach(() => {
  delete (document as any).modelContext;
  delete (navigator as any).modelContext;
  vi.restoreAllMocks();
});

describe('browser MCP tools', () => {
  it('detects document.modelContext and cleans up signal and legacy registrations', () => {
    Object.defineProperty(navigator, 'modelContext', { configurable: true, value: { registerTool: vi.fn() } });
    expect(supportsWebMcpRegistration()).toBe(false);
    const context = installModelContext();
    expect(supportsWebMcpRegistration()).toBe(true);
    const { dispose: cleanup } = registerWebMCPTools('workspace-1', tools);
    expect(context.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'list_tickets', inputSchema: tools[0].inputSchema }), { signal: expect.any(AbortSignal) });
    const signal = context.registerTool.mock.calls[0][1].signal;
    expect(signal.aborted).toBe(false);
    cleanup();
    cleanup();
    expect(context.unregisterTool).toHaveBeenCalledTimes(1);
    expect(context.unregisterTool).toHaveBeenCalledWith('list_tickets');
    expect(signal.aborted).toBe(true);
  });

  it('supports the current draft without unregisterTool', () => {
    const registerTool = vi.fn();
    Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool } });
    expect(supportsWebMcpRegistration()).toBe(true);
    const { dispose: cleanup } = registerWebMCPTools('workspace-1', tools);
    cleanup();
    expect(registerTool.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('executes with the selected workspace on the server and preserves failures', async () => {
    const context = installModelContext();
    const result = { isError: true, content: [{ type: 'text', text: 'This tool is disabled.' }], structuredContent: { error: { message: 'This tool is disabled.' } } };
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ result });
    const { dispose: cleanup } = registerWebMCPTools('workspace-2', [{ ...tools[0], name: 'create_ticket' }]);
    const tool = context.registerTool.mock.calls[0][0];
    expect(await tool.execute({ projectId: 'project-2', title: 'Hello' })).toEqual(result);
    expect(post).toHaveBeenCalledWith('/mcp', expect.objectContaining({ method: 'tools/call', params: { name: 'create_ticket', arguments: { projectId: 'project-2', title: 'Hello' } } }), expect.objectContaining({ headers: { 'X-Workspace-Id': 'workspace-2' } }));
    post.mockResolvedValueOnce({ error: { message: 'Access denied' } });
    await expect(tool.execute({})).rejects.toThrow('Access denied');
    cleanup();
    await expect(tool.execute({})).rejects.toThrow('no longer available');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('rolls back partial registrations if a later synchronous tool fails', async () => {
    const context = installModelContext();
    context.registerTool.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('Duplicate tool'); });
    await expect(registerWebMCPTools('workspace-1', [tools[0], { ...tools[0], name: 'get_ticket' }]).ready).rejects.toThrow('Duplicate tool');
    expect(context.unregisterTool).toHaveBeenCalledWith('list_tickets');
  });

  it('rolls back the entire catalog when the browser rejects an asynchronous registration', async () => {
    const context = installModelContext();
    context.registerTool.mockResolvedValueOnce().mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
    const registration = registerWebMCPTools('workspace-1', [tools[0], { ...tools[0], name: 'get_ticket' }]);
    await expect(registration.ready).rejects.toThrow('Permission denied');
    expect(context.unregisterTool).toHaveBeenCalledExactlyOnceWith('list_tickets');
    expect(context.registerTool.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true);
    await expect(context.registerTool.mock.calls[0][0].execute({})).rejects.toThrow('no longer available');
  });

  it('aborts a pending browser registration immediately when switching workspaces', async () => {
    const context = installModelContext();
    let oldSignal: AbortSignal | undefined;
    context.registerTool.mockImplementationOnce((_tool, { signal }) => {
      oldSignal = signal;
      return new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }).mockResolvedValue(undefined);
    vi.spyOn(apiClient, 'post').mockResolvedValue({ result: { tools: [tools[0], { ...tools[0], name: 'get_ticket' }] } });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hook = renderHook(({ workspaceId }) => useWebMcpRegistration({ workspaceId }), { initialProps: { workspaceId: 'workspace-old' } });
    await waitFor(() => expect(context.registerTool).toHaveBeenCalledTimes(1));
    hook.rerender({ workspaceId: 'workspace-new' });
    expect(oldSignal?.aborted).toBe(true);
    await waitFor(() => expect(context.registerTool).toHaveBeenCalledTimes(3));
    expect(context.registerTool.mock.calls.slice(1).every(([, options]) => !options.signal.aborted)).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('unregisters on workspace changes and ignores late discovery responses', async () => {
    const context = installModelContext();
    let resolveOld: (value: unknown) => void = () => {};
    const post = vi.spyOn(apiClient, 'post')
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValue({ result: { tools } });
    const hook = renderHook(({ workspaceId }) => useWebMcpRegistration({ workspaceId }), { initialProps: { workspaceId: 'workspace-old' } });
    hook.rerender({ workspaceId: 'workspace-new' });
    await waitFor(() => expect(context.registerTool).toHaveBeenCalledTimes(1));
    await act(async () => { resolveOld({ result: { tools: [{ ...tools[0], name: 'stale_tool' }] } }); });
    expect(context.registerTool).toHaveBeenCalledTimes(1);
    hook.rerender({ workspaceId: 'workspace-third' });
    await waitFor(() => expect(context.registerTool).toHaveBeenCalledTimes(2));
    expect(context.unregisterTool).toHaveBeenCalledTimes(1);
    hook.unmount();
    expect(context.unregisterTool).toHaveBeenCalledTimes(2);
    expect((post.mock.calls[0][2] as { signal: AbortSignal }).signal.aborted).toBe(true);
  });
});
