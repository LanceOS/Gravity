import { Cpu, Sparkles, Terminal } from 'lucide-react';
import type { SidebarToolSection } from '../types';
import { agentButtonStyle } from '../utils';

interface SidebarAgentToolsProps {
  tools: SidebarToolSection;
}

export function SidebarAgentTools({ tools }: SidebarAgentToolsProps) {
  return (
    <div style={{ marginTop: '24px', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
        <Cpu size={12} color="var(--accent)" />
        <span>Agent Integrations</span>
      </div>

      <button
        type="button"
        onClick={tools.onOpenOllama}
        className="clickable"
        style={agentButtonStyle()}
      >
        <Sparkles size={12} color="var(--accent)" />
        <span>Ollama AI Assistant</span>
      </button>

      <button
        type="button"
        onClick={tools.onOpenSimulator}
        className="clickable"
        style={agentButtonStyle({ marginTop: '4px' })}
      >
        <Terminal size={12} />
        <span>MCP Agent Simulator</span>
      </button>
    </div>
  );
}