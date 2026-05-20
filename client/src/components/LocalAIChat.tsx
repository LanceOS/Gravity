import React, { useState, useEffect, useRef } from 'react';
import { useTickets, Ticket } from '../context/TicketContext';
import { X, Sparkles, Send, Cpu, Wifi, WifiOff, FileText, ListPlus, Loader2, ArrowRight } from 'lucide-react';

interface LocalAIChatProps {
  onClose: () => void;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export const LocalAIChat: React.FC<LocalAIChatProps> = ({ onClose }) => {
  const { activeTicket, tickets, projects, users } = useTickets();

  // Settings
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [model, setModel] = useState('llama3');
  const [isCheckingModel, setIsCheckingModel] = useState(false);
  const [modelStatus, setModelStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');

  // Chat state
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I am your **Gravity AI Assistant**. I can read the context of your active tickets to help you write descriptions, summarize comments, outline implementation checklists, or draft pull requests.\n\nType a question or select a **Quick Action** below to get started!"
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // Check Ollama status on mount
  const checkOllamaStatus = async (urlToTest = ollamaUrl) => {
    setModelStatus('checking');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(`${urlToTest}/api/tags`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        // Set model name to first available model if it exists
        if (data.models && data.models.length > 0 && !model) {
          setModel(data.models[0].name);
        }
        setModelStatus('connected');
      } else {
        setModelStatus('disconnected');
      }
    } catch (e) {
      setModelStatus('disconnected');
    }
  };

  useEffect(() => {
    checkOllamaStatus();
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
    } catch (e: any) {
      console.error(e);
      setMessages([...newMessages, { 
        role: 'system', 
        content: `❌ **Failed to contact local Ollama**\n\n* **Error details**: ${e.message}\n* **Troubleshooting**:\n  1. Verify Ollama is running in your terminal (\`ollama serve\` or check your desktop application).\n  2. Check if model \`${model}\` is installed. Run \`ollama pull ${model}\` to download it.\n  3. Verify the Ollama API port is open on \`${ollamaUrl}\`.` 
      }]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Quick Action triggers
  const handleQuickAction = (actionType: 'analyze' | 'subtasks' | 'release') => {
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

    let prompt = '';
    const assigneeName = activeTicket.assigneeId ? users.find(u => u.id === activeTicket.assigneeId)?.name : 'Unassigned';
    const projectName = projects.find(p => p.id === activeTicket.projectId)?.name || 'General';

    if (actionType === 'analyze') {
      prompt = `Review this ticket context:\nKey: ${activeTicket.key}\nTitle: ${activeTicket.title}\nDescription: ${activeTicket.description || 'No description'}\nAssignee: ${assigneeName}\nProject: ${projectName}\nStatus: ${activeTicket.status}\nPriority: ${activeTicket.priority}\n\nTask: Provide a detailed architectural analysis of this ticket, identify any immediate design patterns that should be applied, mention any potential code decoupling points, and list any risks or dependencies. Keep it concise.`;
    } else if (actionType === 'subtasks') {
      prompt = `Review this ticket context:\nKey: ${activeTicket.key}\nTitle: ${activeTicket.title}\nDescription: ${activeTicket.description || 'No description'}\n\nTask: Generate an action-oriented technical checklist of 3-5 sub-tasks. Present them in standard markdown bullet points. Under each bullet point, write a 1-sentence engineering instruction.`;
    } else if (actionType === 'release') {
      prompt = `Review this ticket context:\nKey: ${activeTicket.key}\nTitle: ${activeTicket.title}\nDescription: ${activeTicket.description || 'No description'}\nProject: ${projectName}\nPR status: ${activeTicket.prStatus}\n\nTask: Write a professional, punchy Release Note for this ticket as if it were being shipped to production. Summarize what it changes, and why it benefits developers or users.`;
    }

    handleSendMessage(prompt);
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
            onClick={() => checkOllamaStatus()}
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
          <input 
            type="text" 
            className="input"
            style={{ fontSize: '11px', padding: '4px 8px' }}
            placeholder="http://localhost:11434"
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            onBlur={() => checkOllamaStatus()}
          />
          <input 
            type="text" 
            className="input"
            style={{ fontSize: '11px', padding: '4px 8px', width: '100px' }}
            placeholder="llama3"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>
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
          <input 
            type="text" 
            className="input"
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

// Markdown text sub-renderer for Ollama responses
const FormattedMarkdown: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  const paragraphs = text.split('\n\n');
  return (
    <>
      {paragraphs.map((p, pIdx) => {
        const lines = p.split('\n');
        return (
          <div key={pIdx} style={{ marginBottom: pIdx < paragraphs.length - 1 ? '10px' : 0 }}>
            {lines.map((line, lIdx) => {
              if (line.startsWith('* ') || line.startsWith('- ')) {
                return (
                  <li key={lIdx} style={{ marginLeft: '12px', listStyleType: 'disc', margin: '2px 0' }}>
                    <TextInlineParser text={line.replace(/^[\*\-]\s+/, '')} />
                  </li>
                );
              }
              if (line.match(/^\d+\.\s+/)) {
                return (
                  <li key={lIdx} style={{ marginLeft: '12px', listStyleType: 'decimal', margin: '2px 0' }}>
                    <TextInlineParser text={line.replace(/^\d+\.\s+/, '')} />
                  </li>
                );
              }
              return (
                <div key={lIdx}>
                  <TextInlineParser text={line} />
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
};

const TextInlineParser: React.FC<{ text: string }> = ({ text }) => {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);

    const matches = [
      boldMatch ? { index: boldMatch.index!, length: boldMatch[0].length, type: 'bold', text: boldMatch[1] } : null,
      codeMatch ? { index: codeMatch.index!, length: codeMatch[0].length, type: 'code', text: codeMatch[1] } : null
    ].filter((m): m is Exclude<typeof m, null> => m !== null && m.index !== undefined);

    if (matches.length === 0) {
      parts.push(<span key={keyIdx++}>{remaining}</span>);
      break;
    }

    matches.sort((a, b) => a.index - b.index);
    const first = matches[0];

    if (first.index > 0) {
      parts.push(<span key={keyIdx++}>{remaining.substring(0, first.index)}</span>);
    }

    if (first.type === 'bold') {
      parts.push(<strong key={keyIdx++} style={{ color: 'var(--text-heading)', fontWeight: 600 }}>{first.text}</strong>);
    } else if (first.type === 'code') {
      parts.push(<code key={keyIdx++} style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 3px', borderRadius: '3px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{first.text}</code>);
    }

    remaining = remaining.substring(first.index + first.length);
  }

  return <>{parts}</>;
};
