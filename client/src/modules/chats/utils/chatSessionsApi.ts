import { apiClient } from '../../../utils/apiClient';
import type { ChatSession, ChatSessionDetail } from '../types/ChatSession';

export const CHAT_SESSIONS_PAGE_SIZE = 20;

export interface ListChatSessionsParams {
  limit?: number;
  offset?: number;
  search?: string;
}

export function listChatSessions(projectId: string, params: ListChatSessionsParams = {}) {
  const { limit = CHAT_SESSIONS_PAGE_SIZE, offset = 0, search } = params;
  return apiClient.get<ChatSession[]>(`/projects/${encodeURIComponent(projectId)}/chats`, {
    params: {
      limit: String(limit),
      offset: String(offset),
      ...(search ? { search } : {}),
    },
  });
}

export function getChatSession(projectId: string, chatId: string) {
  return apiClient.get<ChatSessionDetail>(
    `/projects/${encodeURIComponent(projectId)}/chats/${encodeURIComponent(chatId)}`
  );
}

export function createChatSession(projectId: string, title?: string) {
  return apiClient.post<ChatSession>(`/projects/${encodeURIComponent(projectId)}/chats`, title ? { title } : {});
}

export function renameChatSession(projectId: string, chatId: string, title: string) {
  return apiClient.patch<ChatSession>(
    `/projects/${encodeURIComponent(projectId)}/chats/${encodeURIComponent(chatId)}`,
    { title }
  );
}

export function deleteChatSession(projectId: string, chatId: string) {
  return apiClient.delete<{ success: boolean }>(
    `/projects/${encodeURIComponent(projectId)}/chats/${encodeURIComponent(chatId)}`
  );
}
