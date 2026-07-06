import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '../context/TicketContextContext';
import {
  API_KEY_MASK,
  getProviderOption,
  normalizeWorkspaceSettings,
  type SavedApiCredential,
  type WorkspaceSettings,
} from '../utils/settings';
import { setStoredWorkspaceDefaultView } from '../utils/workspacePreferences';
import { isThemeMode, type ThemeMode } from '../context/theme/ThemeContext.types';

interface StatusMessage {
  success: boolean;
  message: string;
}

function normalizeApiKeyInput(value: string): string {
  if (value.startsWith(API_KEY_MASK)) {
    return value.slice(API_KEY_MASK.length);
  }
  return value;
}

function normalizeSavedCredentials(rawCredentials: unknown): SavedApiCredential[] {
  if (!Array.isArray(rawCredentials)) {
    return [];
  }

  return rawCredentials.filter((credential): credential is SavedApiCredential => {
    if (!credential || typeof credential !== 'object') {
      return false;
    }

    return typeof credential.provider === 'string' && typeof credential.apiKey === 'string';
  });
}

const KEY_ACTION: Record<'stored' | 'cleared' | 'pending', 'keep' | 'clear' | 'update'> = {
  stored: 'keep',
  cleared: 'clear',
  pending: 'update',
};

function coerceTheme(value: string | null | undefined): ThemeMode | undefined {
  return isThemeMode(value) ? value : undefined;
}

function shallowEqual<T extends Record<string, any>>(objA: T, objB: T): boolean {
  if (Object.is(objA, objB)) return true;
  if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) return false;

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(objB, key) || !Object.is(objA[key], objB[key])) {
      return false;
    }
  }

  return true;
}

interface UseAccountSettingsOptions {
  currentUser: User | null;
  activeView: 'board' | 'list';
  theme: ThemeMode;
  setView: (view: 'board' | 'list') => void;
  setTheme: (theme: ThemeMode) => void;
}

const ACCOUNT_SETTINGS_HYDRATION_TIMEOUT_MS = 5000;

export function useAccountSettings({
  currentUser,
  activeView,
  theme,
  setView,
  setTheme,
}: UseAccountSettingsOptions) {
  const [settings, setSettings] = useState<WorkspaceSettings>(() =>
    normalizeWorkspaceSettings(null, activeView, theme)
  );
  const [originalSettings, setOriginalSettings] = useState<WorkspaceSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<StatusMessage | null>(null);
  const [tutorialResult, setTutorialResult] = useState<StatusMessage | null>(null);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [savedCredentials, setSavedCredentials] = useState<SavedApiCredential[]>([]);
  const [apiKeyState, setApiKeyState] = useState<'stored' | 'cleared' | 'pending'>('cleared');
  const loadRequestId = useRef(0);
  const saveRequestId = useRef(0);

  const savedCredentialByProvider = useMemo(() => {
    const map = new Map<WorkspaceSettings['aiProvider'], SavedApiCredential>();
    for (const credential of savedCredentials) {
      if (!map.has(credential.provider)) {
        map.set(credential.provider, credential);
      }
    }
    return map;
  }, [savedCredentials]);

  useEffect(() => {
    if (!saveSuccess) {
      return undefined;
    }

    const timer = window.setTimeout(() => setSaveSuccess(false), 2000);
    return () => window.clearTimeout(timer);
  }, [saveSuccess]);

  useEffect(() => {
    if (!testResult?.success) {
      return undefined;
    }

    const timer = window.setTimeout(() => setTestResult(null), 3000);
    return () => window.clearTimeout(timer);
  }, [testResult]);

  useEffect(() => {
    if (currentUser) {
      return;
    }

    setSettings(normalizeWorkspaceSettings(null, activeView, theme));
    setOriginalSettings(null);
    setSaveError(null);
    setTestResult(null);
    setTutorialResult(null);
    setSavedCredentials([]);
    setApiKeyState('cleared');
    setSettingsHydrated(false);
  }, [currentUser, activeView, theme]);

  const currentUserId = currentUser?.id;

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    let cancelled = false;
    const requestId = ++loadRequestId.current;
    setSettingsLoading(true);
    setSaveError(null);
    setSettingsHydrated(false);
    const hydrationTimeout = window.setTimeout(() => {
      if (!cancelled && requestId > saveRequestId.current) {
        setSettingsLoading(false);
        setSettingsHydrated(true);
      }
    }, ACCOUNT_SETTINGS_HYDRATION_TIMEOUT_MS);

    fetch(`/api/v1/settings/${currentUserId}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load account settings.');
        }
        return data;
      })
      .then((data) => {
        if (cancelled || requestId <= saveRequestId.current) {
          return;
        }

        const normalizedTheme = coerceTheme(data.theme);
        const nextTheme = normalizedTheme ?? theme;

        const normalized = normalizeWorkspaceSettings(
          data,
          activeView,
          nextTheme
        );
        setSettings(normalized);
        setOriginalSettings(normalized);
        setSavedCredentials(normalizeSavedCredentials(data.savedCredentials));
        setTheme(nextTheme);
        setView(normalized.defaultView);
        setStoredWorkspaceDefaultView(normalized.defaultView);
        setApiKeyState(normalized.apiKey === API_KEY_MASK ? 'stored' : 'cleared');
      })
      .catch((error: Error) => {
        if (!cancelled && requestId > saveRequestId.current) {
          setSaveError(error.message);
        }
      })
      .finally(() => {
        window.clearTimeout(hydrationTimeout);
        if (!cancelled && requestId > saveRequestId.current) {
          setSettingsLoading(false);
          setSettingsHydrated(true);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(hydrationTimeout);
    };
  }, [currentUserId, setTheme, setView]);

  const updateSettings = useCallback((updates: Partial<WorkspaceSettings>) => {
    const nextUpdates = { ...updates };
    if (typeof nextUpdates.apiKey === 'string') {
      nextUpdates.apiKey = normalizeApiKeyInput(nextUpdates.apiKey);
    }

    const providerChanged = typeof nextUpdates.aiProvider === 'string';
    if (providerChanged) {
      const selectedCredential = savedCredentialByProvider.get(nextUpdates.aiProvider as WorkspaceSettings['aiProvider']);

      nextUpdates.apiKey = selectedCredential ? API_KEY_MASK : '';
    }

    setSettings((current) => ({ ...current, ...nextUpdates }));
    setSaveSuccess(false);
    setSaveError(null);

    if (providerChanged) {
      const selectedCredential = savedCredentialByProvider.get(nextUpdates.aiProvider as WorkspaceSettings['aiProvider']);

      setApiKeyState(selectedCredential ? 'stored' : 'cleared');
      setTestResult(null);
    } else if (nextUpdates.apiKey !== undefined) {
      setApiKeyState(nextUpdates.apiKey === '' ? 'cleared' : 'pending');
      setTestResult(null);
    }
    if (nextUpdates.aiProvider !== undefined) {
      setTestResult(null);
    }

  }, [savedCredentialByProvider]);

  const saveSettings = useCallback(async () => {
    if (!currentUser) {
      return;
    }

    const currentSaveRequestId = ++saveRequestId.current;
    setSaveLoading(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const keyAction = KEY_ACTION[apiKeyState];
      const normalizedApiKey = normalizeApiKeyInput(settings.apiKey).trim();
      const requestedTheme = coerceTheme(settings.theme) ?? theme;
      const payload = {
        ...settings,
        theme: requestedTheme,
        keyAction,
        apiKey: keyAction === 'update' ? normalizedApiKey : undefined,
      };

      const response = await fetch(`/api/v1/settings/${currentUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save account settings.');
      }

      if (currentSaveRequestId !== saveRequestId.current) {
        return;
      }

      const normalizedTheme = coerceTheme(data?.theme) ?? requestedTheme;

      const normalized = normalizeWorkspaceSettings(
        {
          ...data,
          theme: normalizedTheme,
        },
        activeView,
        requestedTheme
      );
      setSettings(normalized);
      setOriginalSettings(normalized);
      setSavedCredentials(normalizeSavedCredentials(data.savedCredentials));
      setTheme(normalized.theme);
      setView(normalized.defaultView);
      setStoredWorkspaceDefaultView(normalized.defaultView);
      setApiKeyState(normalized.apiKey === API_KEY_MASK ? 'stored' : 'cleared');
      setTestResult(null);
      setSaveSuccess(true);
    } catch (error) {
      if (currentSaveRequestId === saveRequestId.current) {
        const message = error instanceof Error ? error.message : 'Failed to save account settings.';
        setSaveError(message);
      }
    } finally {
      if (currentSaveRequestId === saveRequestId.current) {
        setSaveLoading(false);
      }
    }
  }, [currentUser, activeView, settings, apiKeyState, setTheme, setView]);

  const removeCredential = useCallback(async (provider: WorkspaceSettings['aiProvider']) => {
    if (!currentUser) {
      return;
    }

    setSaveLoading(true);
    setSaveError(null);

    try {
      const response = await fetch(`/api/v1/settings/${currentUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentialProvider: provider,
          keyAction: 'clear',
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove credential.');
      }

      setSavedCredentials(normalizeSavedCredentials(data.savedCredentials));

      // If the removed provider is the active one, reset the key field
      setSettings((current) => {
        if (current.aiProvider !== provider) {
          return current;
        }
        return { ...current, apiKey: '' };
      });
      setApiKeyState((current) => {
        if (settings.aiProvider !== provider) {
          return current;
        }
        return 'cleared';
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove credential.';
      setSaveError(message);
    } finally {
      setSaveLoading(false);
    }
  }, [currentUser, settings.aiProvider]);

  const resetProviderDraft = useCallback(() => {
    const selectedCredential = savedCredentialByProvider.get(settings.aiProvider);

    setSettings((current) => ({
      ...current,
      apiKey: selectedCredential ? API_KEY_MASK : '',
    }));
    setApiKeyState(selectedCredential ? 'stored' : 'cleared');
    setTestResult(null);
    setSaveSuccess(false);
    setSaveError(null);
  }, [savedCredentialByProvider, settings.aiProvider]);

  const testApiKey = useCallback(async () => {
    const provider = getProviderOption(settings.aiProvider);
    const keyAction = KEY_ACTION[apiKeyState];
    const normalizedApiKey = normalizeApiKeyInput(settings.apiKey).trim();

    if (keyAction === 'clear' || (keyAction === 'keep' && !settings.apiKey)) {
      setTestResult({ success: false, message: `Please enter a ${provider.label} API key to test.` });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/v1/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settings.aiProvider,
          apiKey: keyAction === 'update' ? normalizedApiKey : undefined
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Connection test failed.');
      }

      setTestResult({ success: Boolean(data.connected ?? true), message: data.message || 'Connection verified successfully.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed.';
      setTestResult({ success: false, message });
    } finally {
      setTesting(false);
    }
  }, [settings.aiProvider, settings.apiKey, apiKeyState]);

  const resetTutorial = useCallback(async () => {
    if (!currentUser) {
      return;
    }

    setTutorialResult(null);

    try {
      const response = await fetch(`/api/v1/users/${currentUser.id}/tutorial`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: false }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset tutorial.');
      }

      setTutorialResult({
        success: true,
        message: 'Tutorial reset. It will appear again the next time you reload or sign in.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reset tutorial.';
      setTutorialResult({ success: false, message });
    }
  }, [currentUser]);
  const baselineSettings = originalSettings ?? normalizeWorkspaceSettings(null, activeView, theme);
  const hasChanges = !shallowEqual(
    {
      defaultView: settings.defaultView,
      theme: settings.theme,
      projectLayout: settings.projectLayout,
    },
    {
      defaultView: baselineSettings.defaultView,
      theme: baselineSettings.theme,
      projectLayout: baselineSettings.projectLayout,
    }
  );
  const baselineApiKeyState = baselineSettings.apiKey === API_KEY_MASK ? 'stored' : 'cleared';
  const hasProviderChanges =
    settings.aiProvider !== baselineSettings.aiProvider || apiKeyState !== baselineApiKeyState;

  return {
    settings,
    settingsLoading,
    saveLoading,
    saveSuccess,
    saveError,
    testing,
    testResult,
    tutorialResult,
    savedCredentials,
    updateSettings,
    saveSettings,
    removeCredential,
    resetProviderDraft,
    testApiKey,
    resetTutorial,
    hasProviderChanges,
    hasChanges,
    settingsHydrated,
  };
}
