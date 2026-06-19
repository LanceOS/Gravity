import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAccountSettings } from '../../../hooks/useAccountSettings';
import { useTheme } from '../../settings';
import { useTickets } from '../../../context/TicketContextContext';
import { isOnboardingNeeded } from '../utils/accountPreferences';
import type { AccountPreferencesRouteState } from '../types';

export function useAccountPreferencesPageRoute(): AccountPreferencesRouteState {
  const navigate = useNavigate();
  const { activeView, currentUser, loading, setTheme, setView, theme } = useTickets();
  const {
    settings,
    settingsLoading,
    saveLoading,
    saveSuccess,
    saveError,
    testing,
    testResult,
    savedCredentials,
    tutorialResult,
    ollamaModels,
    ollamaModelsLoading,
    updateSettings,
    saveSettings,
    removeCredential,
    resetProviderDraft,
    testApiKey,
    resetTutorial,
    refreshOllamaModels,
    hasProviderChanges,
    hasChanges,
  } = useAccountSettings({
    currentUser,
    activeView,
    theme,
    setView,
    setTheme,
  });

  const { setDensity, setTheme: setDashboardTheme } = useTheme();

  useEffect(() => {
    if (!settings) {
      return;
    }

    setDensity(settings.projectLayout === 'condensed' ? 'compact' : 'standard');
    setDashboardTheme(settings.theme);
  }, [settings, setDensity, setDashboardTheme]);

  const navigateToDirectory = () => {
    navigate('/workspaces');
  };

  return {
    loading,
    currentUser,
    settings,
    settingsLoading,
    saveLoading,
    saveSuccess,
    hasChanges,
    hasProviderChanges,
    saveError,
    testing,
    testResult,
    tutorialResult,
    ollamaModels,
    ollamaModelsLoading,
    onBack: navigateToDirectory,
    onOpenDirectory: navigateToDirectory,
    onChangeSettings: updateSettings,
    onResetProviderDraft: resetProviderDraft,
    onRefreshOllamaModels: refreshOllamaModels,
    onResetTutorial: resetTutorial,
    onSaveSettings: saveSettings,
    onTestApiKey: testApiKey,
    onRemoveCredential: removeCredential,
    savedCredentials,
    onboardingVisible: isOnboardingNeeded(currentUser?.tutorial_completed),
    completeOnboarding: () => {
      if (!currentUser) {
        return;
      }

      console.log('TODO: tutorial completed for', currentUser);
    },
  };
}

