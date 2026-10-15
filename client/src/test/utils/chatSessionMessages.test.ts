import { describe, expect, it } from 'vitest';
import { toChatMessages } from '../../modules/chats/utils/chatSessionMessages';
import type { ChatSessionDetail, ChatSessionMessage } from '../../modules/chats/types/ChatSession';

function detail(messages: Pick<ChatSessionMessage, 'role' | 'content' | 'metadata'>[], lastMessagePreview: string | null = null): ChatSessionDetail {
  return {
    id: 'chat-1', projectId: 'project-1', teamId: 'team-1', userId: 'user-1',
    title: 'Chat', lastMessagePreview,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    messages: messages.map((message, index) => ({
      id: `message-${index}`, sessionId: 'chat-1', createdAt: '2026-01-01T00:00:00.000Z', ...message,
    })),
  };
}

describe('reopened chat transcript', () => {
  it.each([
    ['successful', 'Tool output (get_ticket): {"id":"internal-123"}', 'Here is the ticket.'],
    ['failed', 'Tool output (get_ticket): {"isError":true,"error":{"message":"internal-123"}}', 'I could not load the ticket.'],
    ['canceled', 'Tool output (create_ticket): {"id":"internal-123"}', 'Generation canceled. Any actions already completed remain in effect.'],
  ])('hides %s tool output while keeping the user-facing response', (_status, rawOutput, response) => {
    expect(toChatMessages(detail([
      { role: 'user', content: 'Please help', metadata: { source: 'chat-client' } },
      { role: 'system', content: rawOutput, metadata: { source: 'tool', toolCall: { id: 'internal-123' } } },
      { role: 'assistant', content: response, metadata: { source: 'ai' } },
    ]))).toEqual([
      { role: 'user', content: 'Please help' },
      { role: 'assistant', content: response },
    ]);
  });

  it('does not use a tool-only preview as a transcript bubble', () => {
    expect(toChatMessages(detail([
      { role: 'system', content: 'Tool output (get_ticket): {"id":"internal-123"}', metadata: { source: 'tool' } },
    ], 'Tool output (get_ticket): {"id":"internal-123"}'))).toEqual([]);
    expect(toChatMessages(detail([], 'Tool output (get_ticket): {"id":"internal-123"}'))).toEqual([]);
  });

  it('keeps user-facing system errors', () => {
    expect(toChatMessages(detail([
      { role: 'system', content: 'Failed to load this chat. Please try again.', metadata: { source: 'chat-client' } },
    ]))).toEqual([{ role: 'system', content: 'Failed to load this chat. Please try again.' }]);
  });
});
