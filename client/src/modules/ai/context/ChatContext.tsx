import React, { createContext, useContext, useState, useEffect, useRef, useEffectEvent } from 'react';
import type { Message, SendMessageOptions } from '../types/LocalAIChat';
import type { WorkspaceSettings } from '../../../utils/settings';
import { apiClient } from '../../../utils/apiClient';
import { queryClient, queryKeys, CACHE_CONFIGS } from '../../../utils/queryClient';
import { getInitialMessages, getInitialModel, getInitialOllamaUrl, buildOllamaErrorMessage } from '../utils/LocalAIChat';

export interface ChatContextType {
  messages: Message[];
  isGenerating: boolean;
  chatSessionId: string;
  mcpTools: any[];
  error: string | null;
  model: string;
  setModel: (model: string) => void;
  ollamaUrl: string;
  setOllamaUrl: (url: string) => void;
  modelStatus: 'connected' | 'disconnected' | 'checking';
  detectedModels: string[];
  isCheckingModel: boolean;
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
  regenerate: () => Promise<void>;
  retry: () => Promise<void>;
  clearChat: () => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  checkOllamaStatus: (urlToTest?: string, announceLoading?: boolean) => Promise<void>;
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
const MAX_TOOL_CALL_DEPTH = 10;

function parseToolArguments(argumentsPayload: Record<string, unknown> | string): Record<string, unknown> | string {
  if (typeof argumentsPayload !== 'string') {
    return argumentsPayload;
  }
  try {
    return JSON.parse(argumentsPayload);
  } catch {
    return argumentsPayload;
  }
}

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
  const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/chats/${encodeURIComponent(chatId)}/stream`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
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

function getMessageContentForModel(message: Message) {
  const modelContext = message.modelContext?.trim();
  if (!modelContext) {
    return message.content;
  }

  return `${message.content}\n\n${modelContext}`;
}

export interface ChatProviderProps {
  children: React.ReactNode;
  initialOllamaUrl: string;
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
  initialOllamaUrl,
  initialModel,
  settings,
  workspaceId,
  projectId,
  seedChatSessionId,
  seedMessages,
  onSessionCreated,
}) => {
  const isThirdParty = settings.agentIntegration === 'third_party';
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

  // Settings states
  const [ollamaUrl, setOllamaUrl] = useState(() => getInitialOllamaUrl(initialOllamaUrl));
  const [model, setModel] = useState(() => {
    if (isThirdParty) {
      return cloudModelsList.includes(initialModel) ? initialModel : cloudModelsList[0];
    }
    return getInitialModel(initialModel);
  });
  const [isCheckingModel, setIsCheckingModel] = useState(false);
  const [modelStatus, setModelStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [detectedModels, setDetectedModels] = useState<string[]>([]);

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
  const lastProjectResetKeyRef = useRef(`${isThirdParty}:${projectId ?? ''}`);

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
    const nextResetKey = `${isThirdParty}:${projectId ?? ''}`;
    if (lastProjectResetKeyRef.current === nextResetKey) {
      return;
    }
    lastProjectResetKeyRef.current = nextResetKey;

    cloudContextVersionRef.current += 1;
    chatSessionIdRef.current = '';
    setChatSessionId('');
    setErrorState(null);
    if (isThirdParty) {
      setMessages(getInitialMessages());
    }
  }, [isThirdParty, projectId]);

  // Synchronize Ollama settings
  useEffect(() => {
    if (!isThirdParty) {
      const activeUrl = getInitialOllamaUrl(initialOllamaUrl);
      setOllamaUrl(activeUrl);
      void checkOllamaStatus(activeUrl, false);
    }
  }, [initialOllamaUrl, isThirdParty]);

  useEffect(() => {
    if (isThirdParty) {
      const defaultCloudModel = cloudModelsList.includes(initialModel) ? initialModel : cloudModelsList[0];
      setModel(defaultCloudModel);
      setModelStatus('connected');
    } else {
      if (initialModel) {
        setModel(initialModel);
      }
    }
  }, [isThirdParty, settings.aiProvider, initialModel]);

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

  const checkOllamaStatus = useEffectEvent(async (urlToTest = ollamaUrl, announceLoading = true) => {
    if (isThirdParty) {
      setModelStatus('connected');
      return;
    }

    if (announceLoading) {
      setIsCheckingModel(true);
      setModelStatus('checking');
    }

    try {
      const data = await queryClient.fetchQuery(
        queryKeys.ollamaModels(urlToTest),
        () =>
          apiClient.get<{ models?: string[]; connected?: boolean }>('/ai/ollama/models', {
            params: {
              ollamaUrl: urlToTest,
            },
          }),
        {
          staleTime: CACHE_CONFIGS.aiModels.staleTime,
          gcTime: CACHE_CONFIGS.aiModels.gcTime,
        }
      );

      const nextModels = Array.isArray(data.models)
        ? data.models.filter((m): m is string => typeof m === 'string' && m.length > 0)
        : [];

      setDetectedModels(nextModels);
      if (data.connected && nextModels.length > 0) {
        if (!model || !nextModels.includes(model)) {
          setModel(nextModels[0]);
        }
        setModelStatus('connected');
      } else if (data.connected && nextModels.length === 0) {
        setModelStatus('connected');
      } else {
        setModelStatus('disconnected');
        setDetectedModels([]);
      }
    } catch {
      setModelStatus('disconnected');
      setDetectedModels([]);
    } finally {
      setIsCheckingModel(false);
    }
  });

  const handleSendMessage = async (
    textToSend: string,
    autoRunMessages?: Message[],
    toolCallDepth = 0,
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
    const requestContextVersion = isThirdParty ? cloudContextVersionRef.current : 0;

    try {
      if (isThirdParty) {
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
        return;
      }

      const payload: Record<string, any> = {
        model,
        messages: newMessages.map(m => ({
          role: m.role,
          content: getMessageContentForModel(m),
          ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
          ...(m.tool_call_id ? { tool_call_id: m.tool_call_id, name: m.name } : {})
        })),
        provider: isThirdParty ? settings.aiProvider : 'ollama',
        ...(mcpTools.length > 0 ? { tools: mcpTools } : {})
      };

      if (!isThirdParty) {
        payload.ollamaUrl = ollamaUrl;
      }

      const data = await apiClient.post<{ message?: { content?: string; tool_calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> | string }> } }>('/ai/chat', payload, {
        headers: {
          'X-Mcp-Sanitize': 'true',
        },
      });

      const providerLabel = isThirdParty ? getProviderName(settings.aiProvider) : 'Ollama';
      const aiResponse = data.message?.content || '';
      const toolCalls = data.message?.tool_calls;

      const assistantMessage: Message = {
        role: 'assistant',
        content: aiResponse,
        ...(toolCalls ? { tool_calls: toolCalls } : {})
      };

      const nextMessages = [...newMessages, assistantMessage];
      setMessages(nextMessages);

      if (toolCalls && toolCalls.length > 0) {
        // Execute tools
        const toolMessages: Message[] = [];
        for (const tc of toolCalls) {
          try {
            const toolData = await apiClient.post<{ result?: { content?: { text?: string }[] }; error?: { message?: string } }>(
              '/mcp/sse',
              {
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'tools/call',
                params: {
                  name: tc.name,
                  arguments: parseToolArguments(tc.arguments),
                },
              },
              {
                headers: {
                  'X-Mcp-Sanitize': 'true',
                  ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
                },
              }
            );
            
            if (toolData.error) {
              toolMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                name: tc.name,
                content: `Error: ${toolData.error.message}`
              });
            } else {
              const toolResult = toolData.result?.content?.[0]?.text || JSON.stringify(toolData);
              toolMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                name: tc.name,
                content: toolResult
              });
            }
          } catch (e: any) {
            toolMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.name,
              content: `Error: ${e.message}`
            });
          }
        }

        // Auto-continue chat with tool results, but guard against unbounded recursion.
        if (toolCallDepth >= MAX_TOOL_CALL_DEPTH) {
          setMessages([...nextMessages, ...toolMessages, {
            role: 'system',
            content: `⚠️ **Agentic loop stopped** — the assistant made more than ${MAX_TOOL_CALL_DEPTH} consecutive tool calls. Please review the conversation and try a more specific prompt.`
          }]);
        } else {
          await handleSendMessage('', [...nextMessages, ...toolMessages], toolCallDepth + 1);
        }

      } else if (!aiResponse) {
        setMessages([...newMessages, { role: 'system', content: `Sorry, I got an empty response from ${providerLabel}.` }]);
      }
    } catch (error) {
      const providerLabel = isThirdParty ? getProviderName(settings.aiProvider) : 'Ollama';
      console.error(error);

      let errorContent: string;
      if (isThirdParty) {
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
        errorContent = `### ⚠️ Connection Error\n\nFailed to contact the **${providerLabel}** API.\n\n${detail}`;
      } else {
        const message = error instanceof Error ? error.message : `Unknown ${providerLabel} error.`;
        errorContent = buildOllamaErrorMessage(model, ollamaUrl, message).content;
      }

      setErrorState(errorContent);
      setMessages([...newMessages, { role: 'system', content: errorContent }]);
    } finally {
      if (!autoRunMessages) {
        setIsGenerating(false);
      }
    }
  };

  const sendMessage = async (content: string, options?: SendMessageOptions) => {
    return handleSendMessage(content, undefined, 0, options);
  };

  const regenerate = async () => {
    if (messages.length < 2 || isGenerating) return;
    const lastUserMsgIdx = [...messages].reverse().findIndex(m => m.role === 'user');
    if (lastUserMsgIdx === -1) return;
    const idx = messages.length - 1 - lastUserMsgIdx;
    const userMsg = messages[idx];
    const newMessages = [...messages.slice(0, idx), userMsg];
    await handleSendMessage(userMsg.content, newMessages, 0, { modelContext: userMsg.modelContext });
  };

  const retry = async () => {
    if (messages.length === 0 || isGenerating) return;
    const lastUserMsgIdx = [...messages].reverse().findIndex(m => m.role === 'user');
    if (lastUserMsgIdx === -1) return;
    const idx = messages.length - 1 - lastUserMsgIdx;
    const userMsg = messages[idx];
    const newMessages = [...messages.slice(0, idx), userMsg];
    await handleSendMessage(userMsg.content, newMessages, 0, { modelContext: userMsg.modelContext });
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
    ollamaUrl,
    setOllamaUrl,
    modelStatus,
    detectedModels,
    isCheckingModel,
    sendMessage,
    regenerate,
    retry,
    clearChat,
    setMessages,
    checkOllamaStatus,
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
