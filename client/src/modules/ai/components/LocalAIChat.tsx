import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useAuth } from '../../../context/auth/AuthContext';
import { useProjectContext } from '../../../context/project/ProjectContext';
import { useActiveTicket } from '../../../context/ticket/ActiveTicketContext';
import { useUserDirectory } from '../../../context/user/UserDirectoryContext';
import { FileText, ListPlus, Sparkles, Wifi, WifiOff } from 'lucide-react';
import { DenseTextInput, AIChatWindow } from '@library';
import type { LocalAIChatProps, Message, QuickActionType } from '../types/LocalAIChat';
import { buildOllamaErrorMessage, buildQuickActionPrompt, getInitialMessages, getInitialModel, getInitialOllamaUrl } from '../utils/LocalAIChat';
import { apiClient } from '../../../utils/apiClient';
import { CACHE_CONFIGS, queryClient, queryKeys } from '../../../utils/queryClient';

const CLOUD_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o'],
  anthropic: ['claude-3-5-sonnet', 'claude-3-haiku'],
  gemini: ['gemini-1.5-flash', 'gemini-1.5-pro'],
  deepseek: ['deepseek-chat'],
};
const CLOUD_PROJECT_REQUIRED_MESSAGE = 'Select a project before using cloud chat.';

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
  payload: { message: string; provider: string; model?: string },
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

export const LocalAIChat: React.FC<LocalAIChatProps> = ({ onClose, initialOllamaUrl, initialModel, settings, workspaceId, projectId, isClosing }) => {
  const { activeTicket } = useActiveTicket();
  const { currentUser } = useAuth();
  const { users } = useUserDirectory();
  const { projects } = useProjectContext();

  const isThirdParty = settings.agentIntegration === 'third_party';

  const getProviderName = (provider?: string) => {
    switch (provider) {
      case 'openai': return 'OpenAI';
      case 'anthropic': return 'Anthropic';
      case 'gemini': return 'Gemini';
      case 'deepseek': return 'DeepSeek';
      default: return 'Cloud';
    }
  };

  const cloudModelsList = CLOUD_MODELS[settings.aiProvider] || ['gpt-4o-mini'];

  // Settings
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

  // Chat state
  const [messages, setMessages] = useState<Message[]>(getInitialMessages);
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatSessionId, setChatSessionId] = useState('');
  const chatSessionIdRef = useRef('');

  useEffect(() => {
    chatSessionIdRef.current = chatSessionId;
  }, [chatSessionId]);

  useEffect(() => {
    chatSessionIdRef.current = '';
    setChatSessionId('');
    if (isThirdParty) {
      setMessages(getInitialMessages());
    }
  }, [isThirdParty, projectId]);

  const ensureCloudChatSession = async () => {
    const activeProjectId = projectId?.trim() || '';
    if (!activeProjectId) {
      throw new Error(CLOUD_PROJECT_REQUIRED_MESSAGE);
    }

    if (chatSessionIdRef.current) {
      return chatSessionIdRef.current;
    }

    const session = await apiClient.post<{ id?: string }>(`/projects/${encodeURIComponent(activeProjectId)}/chats`, {
      title: 'AI Assistant',
    });
    if (!session.id) {
      throw new Error('Failed to create chat session.');
    }

    chatSessionIdRef.current = session.id;
    setChatSessionId(session.id);
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
        // Connected but no models installed
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

  // Synchronize state with hydrated/updated props from parent/settings
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

  /** Maximum number of consecutive tool call round-trips to prevent infinite agentic loops. */
  const MAX_TOOL_CALL_DEPTH = 10;

  const handleSendMessage = async (textToSend: string, autoRunMessages?: Message[], toolCallDepth = 0) => {
    if (!autoRunMessages && (!textToSend.trim() || isGenerating)) return;

    const newMessages: Message[] = autoRunMessages || [...messages, { role: 'user', content: textToSend }];
    setMessages(newMessages);
    if (!autoRunMessages) setIsGenerating(true);

    try {
      if (isThirdParty) {
        const activeProjectId = projectId?.trim() || '';
        const chatId = await ensureCloudChatSession();
        const doneEvent = await postChatCompletionSse(activeProjectId, chatId, {
          message: textToSend,
          provider: settings.aiProvider,
          ...(model ? { model } : {}),
        });
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
          content: m.content,
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
            const toolResult = toolData.result?.content?.[0]?.text || JSON.stringify(toolData);
            toolMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.name,
              content: toolResult
            });
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

        // Map HTTP status codes to safe, user-friendly messages.
        // The raw server error is intentionally not surfaced to avoid leaking
        // sensitive details (URLs, partial IDs, stack traces) into the chat UI.
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

      setMessages([...newMessages, { role: 'system', content: errorContent }]);
    } finally {
      if (!autoRunMessages) {
        setIsGenerating(false);
      }
    }
  };


  const handleQuickAction = (actionType: QuickActionType) => {
    if (!activeTicket) {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: 'system',
          content: 'Select a ticket from the board or list first, then rerun the quick action.',
        },
      ]);
      return;
    }

    handleSendMessage(buildQuickActionPrompt(actionType, { activeTicket, projects, users }));
  };

  return (
    <AIChatWindow
      isClosing={isClosing}
      title={isThirdParty ? `${getProviderName(settings.aiProvider)} Assistant` : 'Local AI Assistant'}
      onClose={onClose}
      messages={messages}
      onSendMessage={(text) => handleSendMessage(text)}
      isGenerating={isGenerating}
      placeholder={activeTicket ? "Ask about this ticket..." : "Ask AI a question..."}
      settingsPanel={
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
            <span style={{ color: 'var(--color-text-disabled)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              {isThirdParty ? 'Cloud Provider Status:' : 'Ollama Endpoint Status:'}
            </span>
            <span
              onClick={() => !isThirdParty && void checkOllamaStatus()}
              className={isThirdParty ? "" : "clickable"}
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 600,
                color: modelStatus === 'connected' ? 'var(--color-success)' : modelStatus === 'checking' ? 'var(--color-text-secondary)' : 'var(--color-error)',
                cursor: isThirdParty ? 'default' : 'pointer'
              }}
            >
              {modelStatus === 'connected' ? <Wifi size={12} /> : <WifiOff size={12} />}
              {modelStatus === 'connected' ? 'Active' : modelStatus === 'checking' ? 'Checking...' : 'Offline'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {!isThirdParty ? (
              <DenseTextInput
                placeholder="http://localhost:11434"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                onBlur={() => void checkOllamaStatus()}
                style={{ fontSize: '11.5px', flex: 1 }}
              />
            ) : null}

            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={!isThirdParty && (isCheckingModel || detectedModels.length === 0)}
              style={{
                fontSize: '11.5px',
                height: '32px',
                borderRadius: '6px',
                border: '1px solid var(--color-border-default)',
                background: 'var(--color-surface-card)',
                color: 'var(--color-text-secondary)',
                padding: '0 8px',
                outline: 'none',
                cursor: 'pointer',
                flex: isThirdParty ? 1 : '0 0 120px',
                maxWidth: '100%',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
              }}
              className="clickable"
            >
              {isThirdParty ? (
                cloudModelsList.map((m) => (
                  <option key={m} value={m} style={{ background: 'var(--color-surface-card)', color: 'var(--color-text-secondary)' }}>
                    {m}
                  </option>
                ))
              ) : detectedModels.length > 0 ? (
                detectedModels.map((m) => (
                  <option key={m} value={m} style={{ background: 'var(--color-surface-card)', color: 'var(--color-text-secondary)' }}>
                    {m}
                  </option>
                ))
              ) : (
                <option value="" style={{ background: 'var(--color-surface-card)', color: 'var(--color-text-disabled)' }}>
                  {isCheckingModel ? 'Checking...' : 'No models'}
                </option>
              )}
            </select>
          </div>
          {!model && !isCheckingModel && !isThirdParty ? (
            <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', lineHeight: 1.4 }}>
              No models detected. Ensure Ollama is running and has models installed.
            </div>
          ) : null}
        </>
      }
      quickActions={
        activeTicket ? (
          <>
            <button
              onClick={() => handleQuickAction('analyze')}
              className="btn clickable"
              style={{ padding: '4px 8px', fontSize: '10px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-surface-card)', color: 'var(--color-text-primary)' }}
            >
              <FileText size={10} />
              <span>Analyze Ticket</span>
            </button>

            <button
              onClick={() => handleQuickAction('subtasks')}
              className="btn clickable"
              style={{ padding: '4px 8px', fontSize: '10px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-surface-card)', color: 'var(--color-text-primary)' }}
            >
              <ListPlus size={10} />
              <span>Create Checklist</span>
            </button>

            <button
              onClick={() => handleQuickAction('release')}
              className="btn clickable"
              style={{ padding: '4px 8px', fontSize: '10px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-surface-card)', color: 'var(--color-text-primary)' }}
            >
              <Sparkles size={10} />
              <span>Draft Release</span>
            </button>
          </>
        ) : undefined
      }
    />
  );
};
