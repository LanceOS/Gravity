import { useWebMcpRegistration } from '../hooks/useWebMcpRegistration';

export function WorkspaceWebMcpRegistration({ workspaceId }: { workspaceId?: string }) {
  useWebMcpRegistration({ workspaceId });
  return null;
}
