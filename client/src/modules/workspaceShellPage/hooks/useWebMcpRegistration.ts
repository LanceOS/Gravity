import { useEffect } from 'react';
import { listMcpTools } from '../../../utils/mcp';
import { registerWebMCPTools, supportsWebMcpRegistration } from '../../../utils/webmcp';

export { supportsWebMcpRegistration } from '../../../utils/webmcp';

export function useWebMcpRegistration({ workspaceId, enabled = true }: { workspaceId?: string; enabled?: boolean }) {
  useEffect(() => {
    if (!enabled || !workspaceId || !supportsWebMcpRegistration()) return;
    const controller = new AbortController();
    let unregister: (() => void) | undefined;
    void listMcpTools(workspaceId, controller.signal).then(tools => {
      if (controller.signal.aborted) return;
      const registration = registerWebMCPTools(workspaceId, tools);
      unregister = registration.dispose;
      return registration.ready;
    }).catch(error => {
      if (!controller.signal.aborted) console.error('Gravity: WebMCP tool registration failed:', error);
    });
    return () => {
      controller.abort();
      unregister?.();
    };
  }, [enabled, workspaceId]);
}
