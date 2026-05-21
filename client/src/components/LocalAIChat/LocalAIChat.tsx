import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTickets } from '../../context/TicketContext';
import { Cpu, FileText, ListPlus, Loader2, Send, Sparkles, Wifi, WifiOff, X } from 'lucide-react';
import { DenseTextInput } from '@library';
import { FormattedMarkdown } from './components';
import type { LocalAIChatProps, Message, QuickActionType } from './types';
import { buildOllamaErrorMessage, buildQuickActionPrompt, getInitialMessages, getInitialModel, getInitialOllamaUrl } from './utils';

export const LocalAIChat: React.FC<LocalAIChatProps> = ({ onClose, initialOllamaUrl, initialModel }) => {
  const { activeTicket, projects, users } = useTickets();

  // Settings
  const [ollamaUrl, setOllamaUrl] = useState(() => getInitialOllamaUrl(initialOllamaUrl));
  const [model, setModel] = useState(() => getInitialModel(initialModel));
  const [isCheckingModel, setIsCheckingModel] = useState(false);
  const [modelStatus, setModelStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');

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
    if (announceLoading) {
      setIsCheckingModel(true);
      setModelStatus('checking');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${urlToTest}/api/tags`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.models && data.models.length > 0 && !model) {
          setModel(data.models[0].name);
        }
        setModelStatus('connected');
      } else {
        setModelStatus('disconnected');
      }
    } catch {
      setModelStatus('disconnected');
    } finally {
      setIsCheckingModel(false);
    }
  });

  useEffect(() => {
    void checkOllamaStatus(getInitialOllamaUrl(initialOllamaUrl), false);
  }, []);

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || chatInput;
    if (!textToSend.trim() || isGenerating) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: textToSend }];
    setMessages(newMessages);
    setChatInput('');
    setIsGenerating(true);

    try {
      const response = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ollamaUrl,
          model,
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Server error proxying to Ollama.');
      }

      const data = await response.json();
      const aiResponse = data.message?.content || 'Sorry, I got an empty response from local Ollama.';
      
      setMessages([...newMessages, { role: 'assistant', content: aiResponse }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown local Ollama error.';
      console.error(error);
      setMessages([...newMessages, buildOllamaErrorMessage(model, ollamaUrl, message)]);
    } finally {
      setIsGenerating(false);
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
        width: '320px',
        borderLeft: '1px solid var(--border)',
        background: 'var(--sidebar-bg)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        flexShrink: 0
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
          Local AI Assistant
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
            Ollama Endpoint Status:
          </span>
          <span 
            onClick={() => void checkOllamaStatus()}
            className="clickable"
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: 600,
              color: modelStatus === 'connected' ? '#10b981' : modelStatus === 'checking' ? 'var(--priority-medium)' : '#ef4444'
            }}
          >
            {modelStatus === 'connected' ? <Wifi size={12} /> : <WifiOff size={12} />}
            {modelStatus === 'connected' ? 'Active' : modelStatus === 'checking' ? 'Checking...' : 'Offline'}
          </span>
        </div>

        {/* Inputs */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <DenseTextInput 
            placeholder="http://localhost:11434"
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            onBlur={() => void checkOllamaStatus()}
            style={{ fontSize: '11.5px' }}
          />
          <DenseTextInput 
            placeholder="llama3"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ fontSize: '11.5px', width: '100px' }}
          />
        </div>
        {!model && !isCheckingModel ? (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            No saved model selected yet. Pick one in Account Preferences or enter a model here for this session.
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
              background: m.role === 'user' ? 'var(--border)' : m.role === 'system' ? 'rgba(239, 68, 68, 0.05)' : 'var(--card-bg)',
              border: `1px solid ${m.role === 'user' ? 'var(--border-focus)' : m.role === 'system' ? '#ef444430' : 'var(--border)'}`,
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '12px',
              lineHeight: '1.5',
              color: m.role === 'user' ? 'var(--text-heading)' : 'var(--text)'
            }}
          >
            <FormattedMarkdown text={m.content} />
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
