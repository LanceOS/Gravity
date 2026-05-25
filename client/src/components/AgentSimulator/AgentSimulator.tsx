import React, { useEffect, useRef, useState } from 'react';
import { useTickets } from '../../context/TicketContext';
import { Terminal, X, Play, Loader2, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';
import type { AgentLogEntry, AgentSimulatorProps } from './types';
import { delay, getInitialAgentLogs } from './utils';
import { Button, Textarea } from '@library';

export const AgentSimulator: React.FC<AgentSimulatorProps> = ({ onClose }) => {
  const { fetchInitialData, projects, users } = useTickets();
  const [prompt, setPrompt] = useState('Create a backend ticket for setup auth, assign to bob, and add comment "Lance is waiting"');
  const [logs, setLogs] = useState<AgentLogEntry[]>(getInitialAgentLogs);
  const [isRunning, setIsRunning] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (type: AgentLogEntry['type'], text: string) => {
    setLogs(prev => [...prev, { type, text }]);
  };

  const executeMcpCall = async (method: string, args: any) => {
    addLog('tool', `👉 Calling MCP tool: "${method}" with arguments:\n${JSON.stringify(args, null, 2)}`);
    
    // Simulate slight network delay for premium visual pacing
    await delay(1200);

    try {
      const response = await fetch('/api/v1/mcp/sse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: method,
            arguments: args
          }
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }

      const textResult = data.result?.content?.[0]?.text || '';
      addLog('success', `✅ Tool execution completed. Result:\n${textResult}`);
      
      // Parse result to get object if needed
      try {
        return JSON.parse(textResult);
      } catch {
        return textResult;
      }
    } catch (e: any) {
      addLog('error', `❌ Tool error: ${e.message}`);
      throw e;
    }
  };

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isRunning) return;

    setIsRunning(true);
    setLogs([
      { type: 'info', text: '🤖 Initializing MCP Virtual Agent Execution...' },
      { type: 'info', text: `Prompt: "${prompt}"` }
    ]);

    try {
      // 1. Initial LLM thought simulation
      addLog('thought', '🤔 [Agent Thought]: Parsing natural language instructions...\nDetermining required sequence of MCP actions:\n- Project ID: p-gravity (Gravity Core)\n- Task: Create backend ticket "Setup user authorization flow"\n- Assignee: Bob Developer (u-bob)\n- Postcomment: "Lance is waiting for this setup"');
      await delay(1800);

      // 2. Call list_tickets tool
      addLog('thought', '🤔 [Agent Thought]: Querying database to check if a ticket with this setup already exists...');
      const listResult = await executeMcpCall('list_tickets', { projectId: 'p-gravity', status: 'todo' });

      // 3. Call create_ticket tool
      addLog('thought', '🤔 [Agent Thought]: No duplicate ticket found. Proceeding to create the new backend ticket assigned to Bob...');
      const createResult = await executeMcpCall('create_ticket', {
        title: 'Setup user authorization flow',
        description: 'Implement workspace session authorization, credential login routes, and connect them to the PostgreSQL workspace schema.',
        status: 'todo',
        priority: 'high',
        projectId: 'p-gravity',
        domainId: 'd-be', // Backend
        assigneeId: 'u-bob' // Bob
      });

      const ticketKey = createResult?.ticket?.key || 'GRA-8';

      // 4. Call add_comment tool
      addLog('thought', `🤔 [Agent Thought]: Ticket created successfully as key ${ticketKey}. Now posting the requested comment on it...`);
      await executeMcpCall('add_comment', {
        ticketKey: ticketKey,
        userId: 'u-alice', // Posting as Alice (AI Agent)
        body: 'Lance is waiting for this setup. Please prioritize JWT signing and secret key environmental variables.'
      });

      // 5. Finalize
      addLog('thought', '🤔 [Agent Thought]: All operations successfully mapped and executed.');
      addLog('success', '🏆 [Simulation Complete]: Gravity workspace has been modified in real-time by the MCP Agent. The UI has refreshed automatically via SSE live events!');
      
      // Request initial reload in case SSE fails
      fetchInitialData();
    } catch (error) {
      addLog('error', '⚠️ Simulation halted due to execution failure.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div 
      style={{
        width: '340px',
        borderLeft: '1px solid var(--color-border-default)',
        background: 'var(--color-surface-app)', // Theme-aware terminal background
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
          borderBottom: '1px solid var(--color-border-default)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--color-base50)'
        }}
      >
        <Terminal size={16} color="var(--color-primary)" />
        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
          MCP Agent Terminal
        </span>

        <button 
          onClick={onClose}
          className="clickable"
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'transparent',
            color: 'var(--color-text-disabled)',
            cursor: 'pointer'
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Terminal logs area */}
      <div 
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          fontFamily: 'var(--mono)',
          fontSize: '11px',
          lineHeight: '1.6',
          color: 'var(--color-text-secondary)', // Theme-aware terminal text color
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        {logs.map((log, idx) => (
          <div 
            key={idx}
            style={{
              padding: '6px 8px',
              borderRadius: '4px',
              background: log.type === 'thought' ? 'rgba(192, 132, 252, 0.04)' : log.type === 'tool' ? 'rgba(59, 130, 246, 0.04)' : log.type === 'success' ? 'rgba(16, 185, 129, 0.04)' : log.type === 'error' ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
              border: log.type === 'thought' ? '1px dashed #c084fc30' : log.type === 'tool' ? '1px solid #3b82f630' : log.type === 'success' ? '1px solid #10b98130' : log.type === 'error' ? '1px solid #ef444430' : 'none',
              color: log.type === 'thought' ? '#c084fc' : log.type === 'tool' ? '#60a5fa' : log.type === 'success' ? '#34d399' : log.type === 'error' ? '#f87171' : '#a1a1aa',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}
          >
            {log.text}
          </div>
        ))}

        {isRunning && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#c084fc', paddingLeft: '8px' }}>
            <Loader2 size={12} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
            <span>Agent is thinking...</span>
          </div>
        )}
        <div ref={terminalEndRef} />
      </div>

      {/* Control panel */}
      <div 
        style={{
          padding: '12px',
          borderTop: '1px solid var(--color-border-default)',
          background: 'var(--color-base50)'
        }}
      >
        <form onSubmit={handleRunSimulation} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--color-text-disabled)' }}>
            <AlertCircle size={10} />
            <span>Click to run mock IDE Agent execution</span>
          </div>

          <Textarea
            rows={3}
            style={{ 
              fontSize: '11px', 
              fontFamily: 'var(--mono)', 
              background: 'var(--color-surface-card)', // Theme-aware input background
              color: 'var(--color-text-primary)',
              resize: 'none'
            }}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type a workflow for the Agent to execute..."
            disabled={isRunning}
          />

          <Button 
            type="submit" 
            variant="primary"
            fullWidth
            disabled={isRunning}
            leftIcon={isRunning ? <Loader2 size={14} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={14} fill="currentColor" />}
          >
            {isRunning ? 'Simulation Active...' : 'Run MCP Agent'}
          </Button>

        </form>
      </div>

    </div>
  );
};

