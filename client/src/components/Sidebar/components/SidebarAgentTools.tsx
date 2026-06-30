import { Cpu, Sparkles, Terminal } from 'lucide-react';
import type { SidebarToolSection } from '../types';
import { agentButtonStyle } from '../utils';

interface SidebarAgentToolsProps {
  tools: SidebarToolSection;
}

export function SidebarAgentTools({ tools }: SidebarAgentToolsProps) {
  const isThirdParty = tools.agentIntegration === 'third_party';
  
  const getProviderName = (provider?: string) => {
    switch (provider) {
      case 'openai': return 'OpenAI';
      case 'anthropic': return 'Anthropic';
      case 'gemini': return 'Gemini';
      case 'deepseek': return 'DeepSeek';
      default: return 'Cloud';
    }
  };

  const assistantLabel = isThirdParty 
    ? `${getProviderName(tools.aiProvider)} AI Assistant` 
    : 'Ollama AI Assistant';

  return (
    <div style={{ marginTop: '24px', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--color-border-default)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)', textTransform: 'uppercase', marginBottom: '6px' }}>
        <Cpu size={12} color="var(--color-primary)" />
        <span>Agent Integrations</span>
      </div>

      <button
        type="button"
        onClick={tools.onOpenOllama}
        className="clickable"
        style={agentButtonStyle()}
      >
        <Sparkles size={12} color="var(--color-primary)" />
        <span>{assistantLabel}</span>
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