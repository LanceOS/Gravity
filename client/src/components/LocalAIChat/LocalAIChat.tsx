import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTickets } from '../../context/TicketContext';
import { Cpu, FileText, ListPlus, Loader2, Send, Sparkles, Wifi, WifiOff, X } from 'lucide-react';
import { DenseTextInput } from '@library';
import { FormattedMarkdown } from './components';
import type { LocalAIChatProps, Message, QuickActionType } from './types';
import { buildOllamaErrorMessage, buildQuickActionPrompt, getInitialMessages, getInitialModel, getInitialOllamaUrl } from './utils';

const CLOUD_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o'],
  anthropic: ['claude-3-5-sonnet', 'claude-3-haiku'],
  gemini: ['gemini-1.5-flash', 'gemini-1.5-pro'],
  deepseek: ['deepseek-chat'],
};

export const LocalAIChat: React.FC<LocalAIChatProps> = ({ onClose, initialOllamaUrl, initialModel, settings, workspaceId }) => {
  const { activeTicket, projects, users } = useTickets();

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
      return;
    }

    fetch('/api/v1/mcp/sse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': workspaceId
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    }).then(res => res.json()).then(data => {
      if (data.result?.tools) {
        setMcpTools(data.result.tools);
      }
    }).catch(console.error);
  }, [workspaceId]);

  // Chat state
  const [messages, setMessages] = useState<Message[]>(getInitialMessages);
  const [chatInput, setChatInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

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
      const response = await fetch(`/api/v1/ai/ollama/models?ollamaUrl=${encodeURIComponent(urlToTest)}`);

      if (response.ok) {
        const data = await response.json() as { models?: string[]; connected?: boolean; error?: string };
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

  const handleSendMessage = async (customText?: string, autoRunMessages?: Message[]) => {
    const textToSend = customText || chatInput;
    if (!autoRunMessages && (!textToSend.trim() || isGenerating)) return;

    const newMessages: Message[] = autoRunMessages || [...messages, { role: 'user', content: textToSend }];
    setMessages(newMessages);
    setChatInput('');
    if (!autoRunMessages) setIsGenerating(true);

    try {
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

      if (isThirdParty) {
        payload.apiKey = settings.apiKey;
      } else {
        payload.ollamaUrl = ollamaUrl;
      }

      const response = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const providerLabel = isThirdParty ? getProviderName(settings.aiProvider) : 'Ollama';

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Server error proxying to ${providerLabel}.`);
      }

      const data = await response.json();
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
            const toolResponse = await fetch('/api/v1/mcp/sse', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {})
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'tools/call',
                params: {
                  name: tc.name,
                  arguments: typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments
                }
              })
            });
            const toolData = await toolResponse.json();
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
        
        // Auto-continue chat with tool results
        await handleSendMessage('', [...nextMessages, ...toolMessages]);
      } else if (!aiResponse) {
        setMessages([...newMessages, { role: 'system', content: `Sorry, I got an empty response from ${providerLabel}.` }]);
      }
    } catch (error) {
      const providerLabel = isThirdParty ? getProviderName(settings.aiProvider) : 'Ollama';
      const message = error instanceof Error ? error.message : `Unknown ${providerLabel} error.`;
      console.error(error);

      const errorContent = isThirdParty
        ? `### ⚠️ Connection Error\n\nFailed to contact the **${providerLabel}** API.\n\n**Details:**\n> ${message}\n\nPlease check your internet connection and verify that your API key is correctly configured in your **Account Preferences**.`
        : buildOllamaErrorMessage(model, ollamaUrl, message).content;

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
    <div 
      style={{
        position: 'fixed',
        bottom: '84px',
        right: '24px',
        width: '360px',
        height: '580px',
        maxHeight: 'calc(100vh - 140px)',
        background: 'rgba(26, 26, 26, 0.85)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        overflow: 'hidden',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Header */}
      <div 
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <Cpu size={16} color="var(--accent)" />
        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-heading)' }}>
          {isThirdParty ? `${getProviderName(settings.aiProvider)} Assistant` : 'Local AI Assistant'}
        </span>

        <button 
          onClick={onClose}
          className="clickable"
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer'
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Settings Panel */}
      <div 
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(255,255,255,0.01)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        {/* Connection status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
          <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
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
              color: modelStatus === 'connected' ? '#10b981' : modelStatus === 'checking' ? 'var(--priority-medium)' : '#ef4444',
              cursor: isThirdParty ? 'default' : 'pointer'
            }}
          >
            {modelStatus === 'connected' ? <Wifi size={12} /> : <WifiOff size={12} />}
            {modelStatus === 'connected' ? 'Active' : modelStatus === 'checking' ? 'Checking...' : 'Offline'}
          </span>
        </div>

        {/* Inputs */}
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
              border: '1px solid var(--border)',
              background: 'var(--card-bg)',
              color: 'var(--text)',
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
                <option key={m} value={m} style={{ background: 'var(--card-bg)', color: 'var(--text)' }}>
                  {m}
                </option>
              ))
            ) : detectedModels.length > 0 ? (
              detectedModels.map((m) => (
                <option key={m} value={m} style={{ background: 'var(--card-bg)', color: 'var(--text)' }}>
                  {m}
                </option>
              ))
            ) : (
              <option value="" style={{ background: 'var(--card-bg)', color: 'var(--text-muted)' }}>
                {isCheckingModel ? 'Checking...' : 'No models'}
              </option>
            )}
          </select>
        </div>
        {!model && !isCheckingModel && !isThirdParty ? (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            No models detected. Ensure Ollama is running and has models installed.
          </div>
        ) : null}
      </div>

      {/* Message Feed Scrolling Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.map((m, idx) => (
          <div 
            key={idx}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              background: m.role === 'user' ? 'var(--border)' : m.role === 'system' ? 'rgba(239, 68, 68, 0.05)' : m.role === 'tool' ? 'var(--sidebar-bg)' : 'var(--card-bg)',
              border: `1px solid ${m.role === 'user' ? 'var(--border-focus)' : m.role === 'system' ? '#ef444430' : m.role === 'tool' ? 'var(--border)' : 'var(--border)'}`,
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '12px',
              lineHeight: '1.5',
              color: m.role === 'user' ? 'var(--text-heading)' : 'var(--text)',
              opacity: m.role === 'tool' ? 0.7 : 1
            }}
          >
            {m.role === 'tool' && (
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Cpu size={10} /> Tool Execution: {m.name}
              </div>
            )}
            {m.content && <FormattedMarkdown text={m.content} />}
            {m.tool_calls && m.tool_calls.map((tc, tcIdx) => (
              <div key={tcIdx} style={{ marginTop: m.content ? '8px' : '0', padding: '6px', background: 'var(--sidebar-bg)', borderRadius: '4px', fontSize: '10px', color: 'var(--text-muted)', border: '1px dashed var(--border)' }}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><Sparkles size={10} /> Calling tool: {tc.name}</div>
                <div style={{ fontFamily: 'var(--mono)', marginTop: '4px', opacity: 0.8 }}>{typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments, null, 2)}</div>
              </div>
            ))}
          </div>
        ))}

        {isGenerating && (
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              alignSelf: 'flex-start',
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '11px',
              color: 'var(--text-muted)'
            }}
          >
            <Loader2 size={12} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
            <span>AI Assistant is writing...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Quick Prompt Triggers */}
      {activeTicket && (
        <div style={{ padding: '8px 12px', display: 'flex', gap: '6px', overflowX: 'auto', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}>
          <button 
            onClick={() => handleQuickAction('analyze')}
            className="btn clickable"
            style={{ padding: '4px 8px', fontSize: '10px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <FileText size={10} />
            <span>Analyze Ticket</span>
          </button>
          
          <button 
            onClick={() => handleQuickAction('subtasks')}
            className="btn clickable"
            style={{ padding: '4px 8px', fontSize: '10px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <ListPlus size={10} />
            <span>Create Checklist</span>
          </button>

          <button 
            onClick={() => handleQuickAction('release')}
            className="btn clickable"
            style={{ padding: '4px 8px', fontSize: '10px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Sparkles size={10} />
            <span>Draft Release</span>
          </button>
        </div>
      )}

      {/* Input bar */}
      <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
          style={{ display: 'flex', gap: '6px' }}
        >
          <DenseTextInput 
            placeholder={activeTicket ? "Ask about this ticket..." : "Ask AI a question..."}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <button 
            type="submit" 
            className="btn btn-primary clickable"
            style={{ width: '32px', height: '32px', padding: 0 }}
          >
            <Send size={12} />
          </button>
        </form>
      </div>

    </div>
  );
};
