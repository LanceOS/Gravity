export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'deepseek';

export interface WorkspaceSettings {
  defaultView: 'board' | 'list';
  theme: 'dark' | 'light';
  ollamaModel: string;
  ollamaEndpoint: string;
  projectLayout: 'standard' | 'condensed';
  apiKey: string;
  aiProvider: AIProvider;
}

export interface ProviderOption {
  value: AIProvider;
  label: string;
  keyLabel: string;
  keyPlaceholder: string;
}

export const AI_PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: 'openai',
    label: 'OpenAI',
    keyLabel: 'OpenAI API Key',
    keyPlaceholder: 'sk-...',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    keyLabel: 'Anthropic API Key',
    keyPlaceholder: 'sk-ant-...',
  },
  {
    value: 'gemini',
    label: 'Gemini',
    keyLabel: 'Gemini API Key',
    keyPlaceholder: 'AIza...',
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    keyLabel: 'DeepSeek API Key',
    keyPlaceholder: 'sk-...',
  },
];

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  defaultView: 'board',
  theme: 'dark',
  ollamaModel: '',
  ollamaEndpoint: 'http://localhost:11434',
  projectLayout: 'standard',
  apiKey: '',
  aiProvider: 'openai',
};

export const isAIProvider = (value: unknown): value is AIProvider =>
  value === 'openai' || value === 'anthropic' || value === 'gemini' || value === 'deepseek';

export const getProviderOption = (provider: AIProvider): ProviderOption =>
  AI_PROVIDER_OPTIONS.find((option) => option.value === provider) || AI_PROVIDER_OPTIONS[0];

export const normalizeWorkspaceSettings = (
  raw: Partial<WorkspaceSettings> | null | undefined,
  activeView: 'board' | 'list',
  theme: 'dark' | 'light'
): WorkspaceSettings => ({
  defaultView: raw?.defaultView === 'list' || raw?.defaultView === 'board' ? raw.defaultView : activeView,
  theme: raw?.theme === 'light' || raw?.theme === 'dark' ? raw.theme : theme,
  ollamaModel: typeof raw?.ollamaModel === 'string' ? raw.ollamaModel : DEFAULT_WORKSPACE_SETTINGS.ollamaModel,
  ollamaEndpoint:
    typeof raw?.ollamaEndpoint === 'string' && raw.ollamaEndpoint.trim().length > 0
      ? raw.ollamaEndpoint
      : DEFAULT_WORKSPACE_SETTINGS.ollamaEndpoint,
  projectLayout: raw?.projectLayout === 'condensed' ? 'condensed' : 'standard',
  apiKey: typeof raw?.apiKey === 'string' ? raw.apiKey : DEFAULT_WORKSPACE_SETTINGS.apiKey,
  aiProvider: isAIProvider(raw?.aiProvider) ? raw.aiProvider : DEFAULT_WORKSPACE_SETTINGS.aiProvider,
});