import { createContext, useContext, type PropsWithChildren } from 'react';

import type { AIProvider, SavedApiCredential, WorkspaceSettings } from '../../../utils/settings';
import { type User } from '../../../context/TicketContext';

import type { AccountPreferencesCategoryMeta, SettingsCategoryId, StatusMessage } from '../types';

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

const AccountPreferencesRuntimeContext = createContext<AccountPreferencesRuntimeContextValue | null>(null);
const AccountPreferencesSettingsContext = createContext<AccountPreferencesSettingsContextValue | null>(null);
const AccountPreferencesCloudContext = createContext<AccountPreferencesCloudContextValue | null>(null);
const AccountPreferencesOllamaContext = createContext<AccountPreferencesOllamaContextValue | null>(null);
const AccountPreferencesOnboardingContext = createContext<AccountPreferencesOnboardingContextValue | null>(null);
const AccountPreferencesNavigationContext = createContext<AccountPreferencesNavigationContextValue | null>(null);
const AccountPreferencesCategoryContext = createContext<AccountPreferencesCategoryContextValue | null>(null);

export function AccountPreferencesRuntimeContextProvider({
  children,
  value,
}: PropsWithChildren<{ value: AccountPreferencesRuntimeContextValue }>): JSX.Element {
  return (
    <AccountPreferencesRuntimeContext.Provider value={value}>
      {children}
    </AccountPreferencesRuntimeContext.Provider>
  );
}

export function AccountPreferencesSettingsContextProvider({
  children,
  value,
}: PropsWithChildren<{ value: AccountPreferencesSettingsContextValue }>): JSX.Element {
  return (
    <AccountPreferencesSettingsContext.Provider value={value}>
      {children}
    </AccountPreferencesSettingsContext.Provider>
  );
}

export function AccountPreferencesCloudContextProvider({
  children,
  value,
}: PropsWithChildren<{ value: AccountPreferencesCloudContextValue }>): JSX.Element {
  return (
    <AccountPreferencesCloudContext.Provider value={value}>
      {children}
    </AccountPreferencesCloudContext.Provider>
  );
}

export function AccountPreferencesOllamaContextProvider({
  children,
  value,
}: PropsWithChildren<{ value: AccountPreferencesOllamaContextValue }>): JSX.Element {
  return (
    <AccountPreferencesOllamaContext.Provider value={value}>
      {children}
    </AccountPreferencesOllamaContext.Provider>
  );
}

export function AccountPreferencesOnboardingContextProvider({
  children,
  value,
}: PropsWithChildren<{ value: AccountPreferencesOnboardingContextValue }>): JSX.Element {
  return (
    <AccountPreferencesOnboardingContext.Provider value={value}>
      {children}
    </AccountPreferencesOnboardingContext.Provider>
  );
}

export function AccountPreferencesNavigationContextProvider({
  children,
  value,
}: PropsWithChildren<{ value: AccountPreferencesNavigationContextValue }>): JSX.Element {
  return (
    <AccountPreferencesNavigationContext.Provider value={value}>
      {children}
    </AccountPreferencesNavigationContext.Provider>
  );
}

export function AccountPreferencesCategoryContextProvider({
  children,
  value,
}: PropsWithChildren<{ value: AccountPreferencesCategoryContextValue }>): JSX.Element {
  return (
    <AccountPreferencesCategoryContext.Provider value={value}>
      {children}
    </AccountPreferencesCategoryContext.Provider>
  );
}

export function useAccountPreferencesRuntimeContext(): AccountPreferencesRuntimeContextValue {
  const context = useContext(AccountPreferencesRuntimeContext);
  if (!context) {
    throw new Error(
      'useAccountPreferencesRuntimeContext must be used within AccountPreferencesRuntimeContextProvider.'
    );
  }

  return context;
}

export function useAccountPreferencesSettingsContext(): AccountPreferencesSettingsContextValue {
  const context = useContext(AccountPreferencesSettingsContext);
  if (!context) {
    throw new Error(
      'useAccountPreferencesSettingsContext must be used within AccountPreferencesSettingsContextProvider.'
    );
  }

  return context;
}

export function useAccountPreferencesCloudContext(): AccountPreferencesCloudContextValue {
  const context = useContext(AccountPreferencesCloudContext);
  if (!context) {
    throw new Error(
      'useAccountPreferencesCloudContext must be used within AccountPreferencesCloudContextProvider.'
    );
  }

  return context;
}

export function useAccountPreferencesOllamaContext(): AccountPreferencesOllamaContextValue {
  const context = useContext(AccountPreferencesOllamaContext);
  if (!context) {
    throw new Error(
      'useAccountPreferencesOllamaContext must be used within AccountPreferencesOllamaContextProvider.'
    );
  }

  return context;
}

export function useAccountPreferencesOnboardingContext(): AccountPreferencesOnboardingContextValue {
  const context = useContext(AccountPreferencesOnboardingContext);
  if (!context) {
    throw new Error(
      'useAccountPreferencesOnboardingContext must be used within AccountPreferencesOnboardingContextProvider.'
    );
  }

  return context;
}

export function useAccountPreferencesNavigationContext(): AccountPreferencesNavigationContextValue {
  const context = useContext(AccountPreferencesNavigationContext);
  if (!context) {
    throw new Error(
      'useAccountPreferencesNavigationContext must be used within AccountPreferencesNavigationContextProvider.'
    );
  }

  return context;
}

export function useAccountPreferencesCategoryContext(): AccountPreferencesCategoryContextValue {
  const context = useContext(AccountPreferencesCategoryContext);
  if (!context) {
    throw new Error(
      'useAccountPreferencesCategoryContext must be used within AccountPreferencesCategoryContextProvider.'
    );
  }

  return context;
}
