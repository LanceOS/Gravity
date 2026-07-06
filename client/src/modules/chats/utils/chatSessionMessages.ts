import type { Message } from '../../ai';
import type { ChatSessionDetail } from '../types/ChatSession';

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
  const transcript = detail.messages
    .map((message) => ({
      role: normalizeChatHistoryRole(message.role),
      content: message.content,
    }))
    .filter((message) => message.content.trim().length > 0);

  if (transcript.length > 0) {
    return transcript;
  }

  const preview = detail.lastMessagePreview?.trim();
  return preview ? [{ role: 'system', content: `Latest activity: ${preview}` }] : [];
}
