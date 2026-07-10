import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAccountSettings } from '../../../hooks/useAccountSettings';
import { useTheme } from '../../settings';
import { useAuth } from '../../../context/auth/AuthContext';
import { useActiveView } from '../../../context/ui/ActiveViewContext';
import { isOnboardingNeeded } from '../utils/accountPreferences';
import { setTutorialCompleted } from '../../../utils/tutorialApi';
import type { AccountPreferencesRouteState } from '../types';

export function useAccountPreferencesPageRoute(): AccountPreferencesRouteState {
  const navigate = useNavigate();
  const [localTutorialCompleted, setLocalTutorialCompleted] = useState(false);
  const { currentUser, loading } = useAuth();
  const { activeView, setView } = useActiveView();
  const { theme, setTheme, setDensity } = useTheme();
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
    updateSettings,
    saveSettings,
    removeCredential,
    resetProviderDraft,
    testApiKey,
    resetTutorial,
    hasProviderChanges,
    hasChanges,
  } = useAccountSettings({
    currentUser,
    activeView,
    theme,
    setView,
    setTheme,
  });

  useEffect(() => {
    if (!settings) {
      return;
    }

    setDensity(settings.projectLayout === 'condensed' ? 'compact' : 'standard');
    setTheme(settings.theme);
  }, [settings, setDensity, setTheme]);

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
    onBack: navigateToDirectory,
    onOpenDirectory: navigateToDirectory,
    onChangeSettings: updateSettings,
    onResetProviderDraft: resetProviderDraft,
    onResetTutorial: resetTutorial,
    onSaveSettings: saveSettings,
    onTestApiKey: testApiKey,
    onRemoveCredential: removeCredential,
    savedCredentials,
    onboardingVisible: !localTutorialCompleted && isOnboardingNeeded(settings.tutorialCompleted),
    completeOnboarding: async () => {
      if (!currentUser) {
        return;
      }

      setLocalTutorialCompleted(true);
      try {
        await setTutorialCompleted(currentUser.id, true);
      } catch (e) {
        // Ignore
      }
    },
  };
}
