import { LocalAIChat, type LocalAIChatProps } from '../../ai';
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
}

export function AiChatDock({
  onClose,
  initialOllamaUrl,
  initialModel,
  settings,
  workspaceId,
  projectId,
  isClosing,
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
  };

  return <LocalAIChat {...chatProps} />;
}
