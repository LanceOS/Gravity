import type { PropsWithChildren } from 'react';

import { SETTINGS_CATEGORIES } from '../utils/accountPreferences';
import type { AccountPreferencesPageProps } from '../types';
import { useAccountPreferencesPageState } from '../hooks/useAccountPreferencesPageState';
import {
  AccountPreferencesCategoryContextProvider,
  AccountPreferencesCloudContextProvider,
  AccountPreferencesNavigationContextProvider,
  AccountPreferencesOnboardingContextProvider,
  AccountPreferencesRuntimeContextProvider,
  AccountPreferencesSettingsContextProvider,
} from '../../../context/accountPreferencesPage/accountPreferencesPageContexts';

export function AccountPreferencesPageProviders({
  children,
  hasChanges,
  ...props
}: PropsWithChildren<AccountPreferencesPageProps>) {
  const { activeCategory, setActiveCategory } = useAccountPreferencesPageState(props.onResetProviderDraft);

  return (
    <AccountPreferencesRuntimeContextProvider
      value={{
        currentUser: props.currentUser,
        settings: props.settings,
        settingsLoading: props.settingsLoading,
        saveLoading: props.saveLoading,
        saveSuccess: props.saveSuccess,
        onSaveSettings: props.onSaveSettings,
        hasChanges: hasChanges ?? false,
        saveError: props.saveError,
      }}
    >
      <AccountPreferencesSettingsContextProvider
        value={{
          settings: props.settings,
          onChangeSettings: props.onChangeSettings,
          onResetProviderDraft: props.onResetProviderDraft,
        }}
      >
        <AccountPreferencesCloudContextProvider
          value={{
            hasProviderChanges: props.hasProviderChanges ?? false,
            testing: props.testing,
            testResult: props.testResult,
            savedCredentials: props.savedCredentials,
            onTestApiKey: props.onTestApiKey,
            onRemoveCredential: props.onRemoveCredential,
          }}
        >
          <AccountPreferencesOnboardingContextProvider
            value={{
              tutorialResult: props.tutorialResult,
              onResetTutorial: props.onResetTutorial,
            }}
          >
            <AccountPreferencesCategoryContextProvider
              value={{
                activeCategory,
                categories: SETTINGS_CATEGORIES,
                setActiveCategory,
              }}
            >
              <AccountPreferencesNavigationContextProvider
                value={{
                  onBack: props.onBack,
                  onOpenDirectory: props.onOpenDirectory,
                }}
              >
                {children}
              </AccountPreferencesNavigationContextProvider>
            </AccountPreferencesCategoryContextProvider>
          </AccountPreferencesOnboardingContextProvider>
        </AccountPreferencesCloudContextProvider>
      </AccountPreferencesSettingsContextProvider>
    </AccountPreferencesRuntimeContextProvider>
  );
}
