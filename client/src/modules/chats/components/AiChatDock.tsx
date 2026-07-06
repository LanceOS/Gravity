import { LocalAIChat, type LocalAIChatProps, type Message } from '../../ai';
import type { WorkspaceSettings } from '../../../utils/settings';

export interface AiChatDockProps {
  onClose: () => void;
  initialOllamaUrl: string;
  initialModel: string;
  settings: WorkspaceSettings;
  workspaceId?: string;
  projectId?: string;
  isClosing?: boolean;
  isMobile?: boolean;
  seedChatSessionId?: string;
  seedMessages?: Message[];
  onSessionCreated?: (chatId: string) => void;
}

export function AiChatDock({
  onClose,
  initialOllamaUrl,
  initialModel,
  settings,
  workspaceId,
  projectId,
  isClosing,
  seedChatSessionId,
  seedMessages,
  onSessionCreated,
}: AiChatDockProps) {
  const chatProps: LocalAIChatProps = {
    onClose,
    initialOllamaUrl,
    initialModel,
    settings,
    workspaceId,
    projectId,
    isClosing,
    variant: 'floating',
    seedChatSessionId,
    seedMessages,
    onSessionCreated,
  };

  return <LocalAIChat {...chatProps} />;
}
