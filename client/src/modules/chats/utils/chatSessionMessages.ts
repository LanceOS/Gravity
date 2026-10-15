import type { Message } from '../../ai';
import type { ChatSessionDetail } from '../types/ChatSession';

function isToolSourced(metadata: unknown): boolean {
  return metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)
    && (metadata as Record<string, unknown>).source === 'tool';
}

export function normalizeChatHistoryRole(role: string): Message['role'] {
  switch (role.trim().toLowerCase()) {
    case 'user':
    case 'human':
      return 'user';
    case 'assistant':
    case 'ai':
    case 'model':
      return 'assistant';
    case 'tool':
      return 'tool';
    case 'system':
    default:
      return 'system';
  }
}

export function toChatMessages(detail: ChatSessionDetail): Message[] {
  return detail.messages
    .filter((message) => !isToolSourced(message.metadata))
    .map((message) => ({
      role: normalizeChatHistoryRole(message.role),
      content: message.content,
    }))
    .filter((message) => message.content.trim().length > 0);
}
