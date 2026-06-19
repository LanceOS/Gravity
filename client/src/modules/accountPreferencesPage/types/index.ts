import type { ComponentType } from 'react';

import type { AIProvider, SavedApiCredential, WorkspaceSettings } from '../../../utils/settings';
import type { User } from '../../../types/domain';

export type SettingsCategoryId = 'general' | 'providers' | 'ollama' | 'onboarding';

export interface StatusMessage {
  success: boolean;
  message: string;
}

export interface AccountPreferencesCategoryMeta {
  id: SettingsCategoryId;
  label: string;
  description: string;
  icon: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
}

export interface AccountPreferencesPageProps {
  currentUser: User;
  settings: WorkspaceSettings;
  settingsLoading: boolean;
  saveLoading: boolean;
  saveSuccess: boolean;
  hasChanges?: boolean;
  hasProviderChanges?: boolean;
  saveError: string | null;
  testing: boolean;
  testResult: StatusMessage | null;
  tutorialResult: StatusMessage | null;
  ollamaModels: string[];
  ollamaModelsLoading: boolean;
  onBack: () => void;
  onOpenDirectory: () => void;
  onChangeSettings: (updates: Partial<WorkspaceSettings>) => void;
  onResetProviderDraft: () => void;
  savedCredentials: SavedApiCredential[];
  onRefreshOllamaModels: () => void;
  onResetTutorial: () => void;
  onSaveSettings: () => void;
  onTestApiKey: () => void;
  onRemoveCredential: (provider: AIProvider) => void;
}

export interface AccountPreferencesRouteState extends Omit<AccountPreferencesPageProps, 'currentUser'> {
  loading: boolean;
  currentUser: User | null;
  onboardingVisible: boolean;
  completeOnboarding: () => void;
}

