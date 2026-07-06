import { LocalAIChat, type LocalAIChatProps, type Message } from '../../ai';
import type { Project } from '../../../context/TicketContextContext';
import type { SidebarTeam } from '../../../types/domain';
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
  ticketAttachmentScopeMode?: LocalAIChatProps['ticketAttachmentScopeMode'];
  ticketAttachmentProjects?: Project[];
  ticketAttachmentTeams?: SidebarTeam[];
  ticketAttachmentDefaultScopeId?: string;
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
  ticketAttachmentScopeMode,
  ticketAttachmentProjects,
  ticketAttachmentTeams,
  ticketAttachmentDefaultScopeId,
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
    ticketAttachmentScopeMode,
    ticketAttachmentProjects,
    ticketAttachmentTeams,
    ticketAttachmentDefaultScopeId,
  };

  return <LocalAIChat {...chatProps} />;
}
