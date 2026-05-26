export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'deepseek';
export type AgentIntegration = 'ollama' | 'third_party';

export const API_KEY_MASK = '••••••••••••';

export interface WorkspaceSettings {
  defaultView: 'board' | 'list';
  theme: 'dark' | 'coal-black' | 'coffee' | 'marble-blue';
  ollamaModel: string;
  ollamaEndpoint: string;
  projectLayout: 'standard' | 'condensed';
  apiKey: string;
  aiProvider: AIProvider;
  agentIntegration: AgentIntegration;
}

export interface SavedApiCredential {
  provider: AIProvider;
  apiKey: string;
  active?: boolean;
  updatedAt?: string;
}

export interface ProviderOption {
  value: AIProvider;
  label: string;
  keyLabel: string;
  keyPlaceholder: string;
}

const GENERIC_API_KEY_LABEL = 'API Key';

export const AI_PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: 'openai',
    label: 'OpenAI',
    keyLabel: GENERIC_API_KEY_LABEL,
    keyPlaceholder: 'sk-...',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    keyLabel: GENERIC_API_KEY_LABEL,
    keyPlaceholder: 'sk-ant-...',
  },
  {
    value: 'gemini',
    label: 'Gemini',
    keyLabel: GENERIC_API_KEY_LABEL,
    keyPlaceholder: 'AIza...',
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    keyLabel: GENERIC_API_KEY_LABEL,
    keyPlaceholder: 'sk-...',
  },
];

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  defaultView: 'board',
  theme: 'marble-blue',
  ollamaModel: '',
  ollamaEndpoint: 'http://localhost:11434',
  projectLayout: 'standard',
  apiKey: '',
  aiProvider: 'openai',
  agentIntegration: 'ollama',
};

export const isAIProvider = (value: unknown): value is AIProvider =>
  value === 'openai' || value === 'anthropic' || value === 'gemini' || value === 'deepseek';

export const getProviderOption = (provider: AIProvider): ProviderOption =>
  AI_PROVIDER_OPTIONS.find((option) => option.value === provider) || AI_PROVIDER_OPTIONS[0];

export const normalizeWorkspaceSettings = (
  raw: Partial<WorkspaceSettings> | null | undefined,
  activeView: 'board' | 'list',
  theme: 'dark' | 'coal-black' | 'coffee' | 'marble-blue'
): WorkspaceSettings => ({
  defaultView: raw?.defaultView === 'list' || raw?.defaultView === 'board' ? raw.defaultView : activeView,
  theme: raw?.theme === 'dark' || raw?.theme === 'coal-black' || raw?.theme === 'coffee' || raw?.theme === 'marble-blue' ? raw.theme : theme,
  ollamaModel: typeof raw?.ollamaModel === 'string' ? raw.ollamaModel : DEFAULT_WORKSPACE_SETTINGS.ollamaModel,
  ollamaEndpoint:
    typeof raw?.ollamaEndpoint === 'string' && raw.ollamaEndpoint.trim().length > 0
      ? raw.ollamaEndpoint
      : DEFAULT_WORKSPACE_SETTINGS.ollamaEndpoint,
  projectLayout: raw?.projectLayout === 'condensed' ? 'condensed' : 'standard',
  apiKey: typeof raw?.apiKey === 'string' ? raw.apiKey : DEFAULT_WORKSPACE_SETTINGS.apiKey,
  aiProvider: isAIProvider(raw?.aiProvider) ? raw.aiProvider : DEFAULT_WORKSPACE_SETTINGS.aiProvider,
  agentIntegration: raw?.agentIntegration === 'third_party' ? 'third_party' : 'ollama',
});