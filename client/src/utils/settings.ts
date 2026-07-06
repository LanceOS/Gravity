import { isThemeMode, type ThemeMode } from '../context/theme/ThemeContext.types';

export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'deepseek';

export const API_KEY_MASK = '••••••••••••';

export interface WorkspaceSettings {
  defaultView: 'board' | 'list';
  theme: ThemeMode;
  projectLayout: 'standard' | 'condensed';
  apiKey: string;
  aiProvider: AIProvider;
  tutorialCompleted?: boolean;
}

export interface SavedApiCredential {
  provider: AIProvider;
  apiKey: string;
  preferredModel?: string;
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
  theme: ThemeMode,
): WorkspaceSettings => ({
  defaultView: raw?.defaultView === 'list' || raw?.defaultView === 'board' ? raw.defaultView : activeView,
  theme: isThemeMode(raw?.theme) ? raw.theme : theme,
  projectLayout: raw?.projectLayout === 'condensed' ? 'condensed' : 'standard',
  apiKey: typeof raw?.apiKey === 'string' ? raw.apiKey : DEFAULT_WORKSPACE_SETTINGS.apiKey,
  aiProvider: isAIProvider(raw?.aiProvider) ? raw.aiProvider : DEFAULT_WORKSPACE_SETTINGS.aiProvider,
  tutorialCompleted: typeof raw?.tutorialCompleted === 'boolean' ? raw.tutorialCompleted : undefined,
});
