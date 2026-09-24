import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../utils/apiClient';
import { useMcpCatalog } from '../../hooks/useMcpCatalog';

afterEach(() => vi.restoreAllMocks());

describe('useMcpCatalog', () => {
  it('loads the full registry and discards another workspace’s pending response', async () => {
    let resolveOld: (value: unknown) => void = () => {};
    const tools = [{ name: 'new_tool', description: 'New server capability', inputSchema: {} }];
    const get = vi.spyOn(apiClient, 'get').mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue({ tools });
    const hook = renderHook(({ workspaceId }) => useMcpCatalog(workspaceId), { initialProps: { workspaceId: 'old' } });
    hook.rerender({ workspaceId: 'new' });
    await waitFor(() => expect(hook.result.current.tools).toEqual(tools));
    await act(async () => { resolveOld({ tools: [{ name: 'old_tool' }] }); });
    expect(hook.result.current.tools).toEqual(tools);
    expect(get).toHaveBeenLastCalledWith('/workspaces/new/mcp/tools', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect((get.mock.calls[0][1] as { signal: AbortSignal }).signal.aborted).toBe(true);
  });

  it('reports unavailable catalogs without substituting a stale hard-coded list', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Unable to reach server'));
    const hook = renderHook(() => useMcpCatalog('workspace-1'));
    await waitFor(() => expect(hook.result.current.error).toBe('Unable to reach server'));
    expect(hook.result.current.tools).toEqual([]);
  });
});
