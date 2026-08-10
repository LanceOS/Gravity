import { Cpu, Sparkles, Terminal } from 'lucide-react';
import type { SidebarToolSection } from '../types';

interface SidebarAgentToolsProps {
  tools: SidebarToolSection;
}

export function SidebarAgentTools({ tools }: SidebarAgentToolsProps) {
  const getProviderName = (provider?: string) => {
    switch (provider) {
      case 'openai': return 'OpenAI';
      case 'anthropic': return 'Anthropic';
      case 'gemini': return 'Gemini';
      case 'deepseek': return 'DeepSeek';
      default: return 'Cloud';
    }
  };

  const assistantLabel = `${getProviderName(tools.aiProvider)} AI Assistant`;

  return (
    <div className="sidebar-agent-tools">
      <div className="sidebar-agent-tools__title">
        <Cpu size={12} color="var(--color-primary)" />
        <span>Agent Integrations</span>
      </div>

      <button
        type="button"
        onClick={tools.onOpenAgent}
        className="sidebar-agent-tools__button"
      >
        <Sparkles size={12} color="var(--color-primary)" />
        <span>{assistantLabel}</span>
      </button>

      <button
        type="button"
        onClick={tools.onOpenSimulator}
        className="sidebar-agent-tools__button"
      >
        <Terminal size={12} />
        <span>MCP Agent Simulator</span>
      </button>
    </div>
  );
}
