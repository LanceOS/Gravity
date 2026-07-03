export interface ChatSession {
  id: string;
  projectId: string;
  teamId: string;
  userId: string;
  title: string;
  lastMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: unknown;
  createdAt: string;
}

export interface ChatSessionDetail extends ChatSession {
  messages: ChatSessionMessage[];
}
