import { WorkspacePageLayout } from '../../../layouts/WorkspacePageLayout/WorkspacePageLayout';
import { WorkspaceChatDock } from '../../chats';
import type { WorkspaceSettings } from '../../../utils/settings';

interface WorkspaceChatPageProps {
  workspaceId: string;
  projectId: string;
  initialOllamaUrl: string;
  initialModel: string;
  settings: WorkspaceSettings;
  isMobile?: boolean;
}

export function WorkspaceChatPage({
  workspaceId,
  projectId,
  initialOllamaUrl,
  initialModel,
  settings,
  isMobile = false,
}: WorkspaceChatPageProps) {
  return (
    <WorkspacePageLayout
      title="AI Chat"
      pageClassName="workspace-chat-page"
      contentClassName="workspace-chat-page__content"
      contentShellClassName="workspace-chat-page__shell"
      bodyOverflow="visible"
      wrapBody={false}
    >
      <WorkspaceChatDock
        workspaceId={workspaceId}
        projectId={projectId}
        initialOllamaUrl={initialOllamaUrl}
        initialModel={initialModel}
        settings={settings}
        isMobile={isMobile}
        style={{ flex: 1, minHeight: 0 }}
      />
    </WorkspacePageLayout>
  );
}
