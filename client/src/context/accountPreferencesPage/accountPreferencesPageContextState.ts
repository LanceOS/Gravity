import { createContext, type Context } from 'react';

import type { AIProvider, SavedApiCredential, WorkspaceSettings } from '../../utils/settings';
import { type User } from '../TicketContext';

import type { AccountPreferencesCategoryMeta, SettingsCategoryId, StatusMessage } from '../../types';

export interface AccountPreferencesRuntimeContextValue {
  currentUser: User;
  settings: WorkspaceSettings;
  settingsLoading: boolean;
  saveLoading: boolean;
  saveSuccess: boolean;
  onSaveSettings: () => void;
  hasChanges: boolean;
  saveError: string | null;
}

export interface AccountPreferencesSettingsContextValue {
  settings: WorkspaceSettings;
  onChangeSettings: (updates: Partial<WorkspaceSettings>) => void;
  onResetProviderDraft: () => void;
}

export interface AccountPreferencesCloudContextValue {
  hasProviderChanges: boolean;
  testing: boolean;
  testResult: StatusMessage | null;
  savedCredentials: SavedApiCredential[];
  onTestApiKey: () => void;
  onRemoveCredential: (provider: AIProvider) => void;
}

export interface AccountPreferencesOllamaContextValue {
  ollamaModels: string[];
  ollamaModelsLoading: boolean;
  onRefreshOllamaModels: () => void;
}

export interface AccountPreferencesOnboardingContextValue {
  tutorialResult: StatusMessage | null;
  onResetTutorial: () => void;
}

export interface AccountPreferencesNavigationContextValue {
  onBack: () => void;
  onOpenDirectory: () => void;
}

export interface AccountPreferencesCategoryContextValue {
  activeCategory: SettingsCategoryId;
  categories: AccountPreferencesCategoryMeta[];
  setActiveCategory: (category: SettingsCategoryId) => void;
}

export const AccountPreferencesRuntimeContext: Context<AccountPreferencesRuntimeContextValue | null> = createContext<AccountPreferencesRuntimeContextValue | null>(null);
export const AccountPreferencesSettingsContext: Context<AccountPreferencesSettingsContextValue | null> =
  createContext<AccountPreferencesSettingsContextValue | null>(null);
export const AccountPreferencesCloudContext: Context<AccountPreferencesCloudContextValue | null> =
  createContext<AccountPreferencesCloudContextValue | null>(null);
export const AccountPreferencesOllamaContext: Context<AccountPreferencesOllamaContextValue | null> =
  createContext<AccountPreferencesOllamaContextValue | null>(null);
export const AccountPreferencesOnboardingContext: Context<AccountPreferencesOnboardingContextValue | null> =
  createContext<AccountPreferencesOnboardingContextValue | null>(null);
export const AccountPreferencesNavigationContext: Context<AccountPreferencesNavigationContextValue | null> =
  createContext<AccountPreferencesNavigationContextValue | null>(null);
export const AccountPreferencesCategoryContext: Context<AccountPreferencesCategoryContextValue | null> =
  createContext<AccountPreferencesCategoryContextValue | null>(null);
