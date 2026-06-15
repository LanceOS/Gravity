import { useContext } from 'react';
import {
  AccountPreferencesCategoryContext,
  AccountPreferencesCloudContext,
  AccountPreferencesNavigationContext,
  AccountPreferencesOnboardingContext,
  AccountPreferencesOllamaContext,
  AccountPreferencesRuntimeContext,
  AccountPreferencesSettingsContext,
  type AccountPreferencesCategoryContextValue,
  type AccountPreferencesCloudContextValue,
  type AccountPreferencesNavigationContextValue,
  type AccountPreferencesOnboardingContextValue,
  type AccountPreferencesOllamaContextValue,
  type AccountPreferencesRuntimeContextValue,
  type AccountPreferencesSettingsContextValue,
} from './accountPreferencesPageContextState';

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
