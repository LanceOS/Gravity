import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { Message, SendMessageOptions } from '../types/AgentChat';
import type { WorkspaceSettings } from '../../../utils/settings';
import { apiClient } from '../../../utils/apiClient';
import { queryClient, queryKeys, CACHE_CONFIGS } from '../../../utils/queryClient';
import { getInitialMessages, getInitialModel } from '../utils/AgentChat';

export interface ChatContextType {
  messages: Message[];
  isGenerating: boolean;
  chatSessionId: string;
  mcpTools: any[];
  error: string | null;
  model: string;
  setModel: (model: string) => void;
  modelStatus: 'connected' | 'disconnected' | 'checking';
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
  regenerate: () => Promise<void>;
  retry: () => Promise<void>;
  clearChat: () => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setChatSessionId: (chatId: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const CLOUD_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o'],
  anthropic: ['claude-3-5-sonnet', 'claude-3-haiku'],
  gemini: ['gemini-1.5-flash', 'gemini-1.5-pro'],
  deepseek: ['deepseek-chat'],
};

const CLOUD_PROJECT_REQUIRED_MESSAGE = 'Select a project before using cloud chat.';

type ChatSseDoneEvent = {
  type: 'done';
  message?: string;
  toolCalls?: unknown;
};

type ChatSseErrorEvent = {
  type: 'error';
  message?: string;
};

type ChatSseEvent = ChatSseDoneEvent | ChatSseErrorEvent;

function isChatSseEvent(value: unknown): value is ChatSseEvent {
  return !!value && typeof value === 'object' && 'type' in value;
}

function parseChatSseEvents(streamText: string): ChatSseEvent[] {
  return streamText
    .split(/\r?\n\r?\n/)
    .map((block) => block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim())
    .filter((payload) => payload.length > 0)
    .map((payload) => JSON.parse(payload) as unknown)
    .filter(isChatSseEvent);
}

async function readErrorMessage(response: Response) {
  try {
    const body = await response.json();
    return body?.error || body?.message || response.statusText || 'Chat request failed.';
  } catch {
    return response.statusText || 'Chat request failed.';
  }
}

async function postChatCompletionSse(
  projectId: string,
  chatId: string,
  payload: { message: string; provider: string; model?: string; context?: string },
) {
  const response = await apiClient.raw(`/projects/${encodeURIComponent(projectId)}/chats/${encodeURIComponent(chatId)}/stream`, {
    method: 'POST',
    headers: { Accept: 'text/event-stream' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    const error = new Error(message);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  const events = parseChatSseEvents(await response.text());
  const errorEvent = events.find((event): event is ChatSseErrorEvent => event.type === 'error');
  if (errorEvent) {
    throw new Error(errorEvent.message || 'Chat generation failed.');
  }

  const doneEvent = [...events].reverse().find((event): event is ChatSseDoneEvent => event.type === 'done');
  if (!doneEvent) {
    throw new Error('Chat stream ended without a completion event.');
  }

  return doneEvent;
}

export interface ChatProviderProps {
  children: React.ReactNode;
  initialModel: string;
  settings: WorkspaceSettings;
  workspaceId?: string;
  projectId?: string;
  seedChatSessionId?: string;
  seedMessages?: Message[];
  onSessionCreated?: (chatId: string) => void;
}

export const ChatContextProvider: React.FC<ChatProviderProps> = ({
  children,
  initialModel,
  settings,
  workspaceId,
  projectId,
  seedChatSessionId,
  seedMessages,
  onSessionCreated,
}) => {
  const cloudModelsList = CLOUD_MODELS[settings.aiProvider] || ['gpt-4o-mini'];

  const getProviderName = (provider?: string) => {
    switch (provider) {
      case 'openai': return 'OpenAI';
      case 'anthropic': return 'Anthropic';
      case 'gemini': return 'Gemini';
      case 'deepseek': return 'DeepSeek';
      default: return 'Cloud';
    }
  };

  const [model, setModel] = useState(() => {
    const initial = getInitialModel(initialModel);
    return cloudModelsList.includes(initial) ? initial : cloudModelsList[0];
  });
  const [modelStatus, setModelStatus] = useState<'connected' | 'disconnected' | 'checking'>('connected');

  // MCP Tools
  const [mcpTools, setMcpTools] = useState<any[]>([]);

  // Chat states
  const [messages, setMessages] = useState<Message[]>(() =>
    seedMessages && seedMessages.length > 0 ? seedMessages : getInitialMessages()
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatSessionId, setChatSessionId] = useState(() => seedChatSessionId || '');
  const [errorState, setErrorState] = useState<string | null>(null);

  const chatSessionIdRef = useRef(seedChatSessionId || '');
  const cloudContextVersionRef = useRef(0);
  const lastProjectResetKeyRef = useRef(projectId ?? '');

  useEffect(() => {
    chatSessionIdRef.current = chatSessionId;
  }, [chatSessionId]);

  useEffect(() => {
    const nextChatSessionId = seedChatSessionId || '';
    chatSessionIdRef.current = nextChatSessionId;
    setChatSessionId(nextChatSessionId);
    setMessages(seedMessages && seedMessages.length > 0 ? seedMessages : getInitialMessages());
    setErrorState(null);
  }, [seedChatSessionId, seedMessages]);

  useEffect(() => {
    const nextResetKey = projectId ?? '';
    if (lastProjectResetKeyRef.current === nextResetKey) {
      return;
    }
    lastProjectResetKeyRef.current = nextResetKey;

    cloudContextVersionRef.current += 1;
    chatSessionIdRef.current = '';
    setChatSessionId('');
    setErrorState(null);
    setMessages(getInitialMessages());
  }, [projectId]);

  useEffect(() => {
    const initial = getInitialModel(initialModel);
    const defaultCloudModel = cloudModelsList.includes(initial) ? initial : cloudModelsList[0];
    setModel(defaultCloudModel);
    setModelStatus('connected');
  }, [settings.aiProvider, initialModel]);

  // Fetch MCP tools
  useEffect(() => {
    if (!workspaceId) {
      setMcpTools([]);
      return;
    }

    queryClient
      .fetchQuery(
        queryKeys.mcpTools(workspaceId),
        () =>
          apiClient.post<{ result?: { tools?: any[] } }>('/mcp/sse', {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
          }, {
            headers: {
              'X-Workspace-Id': workspaceId,
            },
          }),
        {
          staleTime: CACHE_CONFIGS.aiTools.staleTime,
          gcTime: CACHE_CONFIGS.aiTools.gcTime,
        },
      )
      .then((data) => {
        setMcpTools(data.result?.tools ?? []);
      })
      .catch(console.error);
  }, [workspaceId]);

  const ensureCloudChatSession = async (requestContextVersion: number) => {
    const activeProjectId = projectId?.trim() || '';
    if (!activeProjectId) {
      throw new Error(CLOUD_PROJECT_REQUIRED_MESSAGE);
    }

    if (chatSessionIdRef.current) {
      return chatSessionIdRef.current;
    }

    const session = await apiClient.post<{ id?: string }>(`/projects/${encodeURIComponent(activeProjectId)}/chats`, {});
    if (!session.id) {
      throw new Error('Failed to create chat session.');
    }

    if (cloudContextVersionRef.current !== requestContextVersion) {
      return session.id;
    }

    chatSessionIdRef.current = session.id;
    setChatSessionId(session.id);
    onSessionCreated?.(session.id);

    return session.id;
  };

  const handleSendMessage = async (
    textToSend: string,
    autoRunMessages?: Message[],
    options: SendMessageOptions = {},
  ) => {
    if (!autoRunMessages && (!textToSend.trim() || isGenerating)) return;

    setErrorState(null);
    const normalizedModelContext = options.modelContext?.trim();
    const userMessage: Message = {
      role: 'user',
      content: textToSend,
      ...(normalizedModelContext ? { modelContext: normalizedModelContext } : {}),
    };
    const newMessages: Message[] = autoRunMessages || [...messages, userMessage];
    setMessages(newMessages);
    if (!autoRunMessages) setIsGenerating(true);
    const requestContextVersion = cloudContextVersionRef.current;

    try {
      const activeProjectId = projectId?.trim() || '';
      const chatId = await ensureCloudChatSession(requestContextVersion);
      if (cloudContextVersionRef.current !== requestContextVersion) {
        return;
      }
      const doneEvent = await postChatCompletionSse(activeProjectId, chatId, {
        message: textToSend,
        provider: settings.aiProvider,
        ...(model ? { model } : {}),
        ...(normalizedModelContext ? { context: normalizedModelContext } : {}),
      });
      if (cloudContextVersionRef.current !== requestContextVersion) {
        return;
      }
      const aiResponse = doneEvent.message || '';

      if (aiResponse) {
        setMessages([...newMessages, { role: 'assistant', content: aiResponse }]);
      } else {
        setMessages([...newMessages, { role: 'system', content: `Sorry, I got an empty response from ${getProviderName(settings.aiProvider)}.` }]);
      }
    } catch (error) {
      const providerLabel = getProviderName(settings.aiProvider);
      console.error(error);

      if (error instanceof Error && error.message === CLOUD_PROJECT_REQUIRED_MESSAGE) {
        setMessages([...newMessages, { role: 'system', content: error.message }]);
        return;
      }

      if (cloudContextVersionRef.current !== requestContextVersion) {
        return;
      }

      const statusCode = error instanceof Error && 'status' in error ? (error as any).status : undefined;
      let detail: string;
      if (statusCode === 401 || statusCode === 403) {
        detail = 'Your API key appears to be invalid or lacks the required permissions. Please update it in **Account Preferences**.';
      } else if (statusCode === 429) {
        detail = 'The provider is rate-limiting your requests. Please wait a moment and try again.';
      } else if (statusCode === 402) {
        detail = 'Your provider account may have insufficient credits. Please check your billing settings.';
      } else {
        detail = 'Please check your internet connection and verify that your API key is correctly configured in **Account Preferences**.';
      }
      const errorContent = `### ⚠️ Connection Error\n\nFailed to contact the **${providerLabel}** API.\n\n${detail}`;

      setErrorState(errorContent);
      setMessages([...newMessages, { role: 'system', content: errorContent }]);
    } finally {
      if (!autoRunMessages) {
        setIsGenerating(false);
      }
    }
  };

  const sendMessage = async (content: string, options?: SendMessageOptions) => {
    return handleSendMessage(content, undefined, options);
  };

  const regenerate = async () => {
    if (messages.length < 2 || isGenerating) return;
    const lastUserMsgIdx = [...messages].reverse().findIndex(m => m.role === 'user');
    if (lastUserMsgIdx === -1) return;
    const idx = messages.length - 1 - lastUserMsgIdx;
    const userMsg = messages[idx];
    const newMessages = [...messages.slice(0, idx), userMsg];
    await handleSendMessage(userMsg.content, newMessages, { modelContext: userMsg.modelContext });
  };

  const retry = async () => {
    if (messages.length === 0 || isGenerating) return;
    const lastUserMsgIdx = [...messages].reverse().findIndex(m => m.role === 'user');
    if (lastUserMsgIdx === -1) return;
    const idx = messages.length - 1 - lastUserMsgIdx;
    const userMsg = messages[idx];
    const newMessages = [...messages.slice(0, idx), userMsg];
    await handleSendMessage(userMsg.content, newMessages, { modelContext: userMsg.modelContext });
  };

  const clearChat = () => {
    setMessages(getInitialMessages());
    setErrorState(null);
  };

  const value: ChatContextType = {
    messages,
    isGenerating,
    chatSessionId,
    mcpTools,
    error: errorState,
    model,
    setModel,
    modelStatus,
    sendMessage,
    regenerate,
    retry,
    clearChat,
    setMessages,
    setChatSessionId,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChat must be used within a ChatContextProvider');
  }
  return ctx;
};
