import { useCallback, useEffect, useState } from 'react';
import type { User } from '../context/TicketContext';
import {
  DEFAULT_WORKSPACE_SETTINGS,
  API_KEY_MASK,
  getProviderOption,
  normalizeWorkspaceSettings,
  type SavedApiCredential,
  type WorkspaceSettings,
} from '../utils/settings';

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

function getSavedCredentialForProvider(
  credentials: SavedApiCredential[],
  provider: WorkspaceSettings['aiProvider'],
) {
  return credentials.find((credential) => credential.provider === provider);
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
  theme: 'dark' | 'coal-black' | 'coffee' | 'marble-blue';
  setView: (view: 'board' | 'list') => void;
  setTheme: (theme: 'dark' | 'coal-black' | 'coffee' | 'marble-blue') => void;
}

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
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [savedCredentials, setSavedCredentials] = useState<SavedApiCredential[]>([]);
  const [apiKeyState, setApiKeyState] = useState<'stored' | 'cleared' | 'pending'>('cleared');

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
    setOllamaModels([]);
    setSavedCredentials([]);
    setApiKeyState('cleared');
    setSettingsHydrated(false);
  }, [currentUser, activeView, theme]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    let cancelled = false;
    setSettingsLoading(true);
    setSaveError(null);
    setSettingsHydrated(false);

    fetch(`/api/v1/settings/${currentUser.id}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load account settings.');
        }
        return data;
      })
      .then((data) => {
        if (!cancelled) {
          const normalized = normalizeWorkspaceSettings(
            data,
            DEFAULT_WORKSPACE_SETTINGS.defaultView,
            DEFAULT_WORKSPACE_SETTINGS.theme
          );
          setSettings(normalized);
          setOriginalSettings(normalized);
          setSavedCredentials(normalizeSavedCredentials(data.savedCredentials));
          setTheme(normalized.theme);
          setView(normalized.defaultView);
          setApiKeyState(normalized.apiKey === API_KEY_MASK ? 'stored' : 'cleared');
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setSaveError(error.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSettingsLoading(false);
          setSettingsHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, setTheme, setView]);

  const refreshOllamaModels = useCallback(async (endpoint?: string) => {
    const ollamaUrl = (endpoint ?? settings.ollamaEndpoint).trim();
    if (!ollamaUrl) {
      setOllamaModels([]);
      return;
    }

    setOllamaModelsLoading(true);
    try {
      const response = await fetch(`/api/v1/ai/ollama/models?ollamaUrl=${encodeURIComponent(ollamaUrl)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to detect Ollama models.');
      }

      // Handle both the legacy raw-array format and the new { models, connected } format
      const rawModels = Array.isArray(data)
        ? data
        : Array.isArray(data.models)
          ? data.models
          : [];
      const nextModels = rawModels.filter((model: unknown): model is string => typeof model === 'string' && model.length > 0);

      setOllamaModels(nextModels);
      setSettings((current) => {
        if (nextModels.length === 0 || nextModels.includes(current.ollamaModel)) {
          return current;
        }

        return { ...current, ollamaModel: nextModels[0] };
      });
    } catch {
      setOllamaModels([]);
    } finally {
      setOllamaModelsLoading(false);
    }
  }, [settings.ollamaEndpoint]);

  useEffect(() => {
    if (!currentUser || !settingsHydrated) {
      return;
    }

    const timer = setTimeout(() => {
      void refreshOllamaModels(settings.ollamaEndpoint);
    }, 500);

    return () => clearTimeout(timer);
  }, [currentUser, settings.ollamaEndpoint, settingsHydrated, refreshOllamaModels]);

  const updateSettings = useCallback((updates: Partial<WorkspaceSettings>) => {
    const nextUpdates = { ...updates };
    if (typeof nextUpdates.apiKey === 'string') {
      nextUpdates.apiKey = normalizeApiKeyInput(nextUpdates.apiKey);
    }

    const providerChanged = typeof nextUpdates.aiProvider === 'string';
    if (providerChanged) {
      const selectedCredential = getSavedCredentialForProvider(
        savedCredentials,
        nextUpdates.aiProvider as WorkspaceSettings['aiProvider'],
      );

      nextUpdates.apiKey = selectedCredential ? API_KEY_MASK : '';
    }

    setSettings((current) => ({ ...current, ...nextUpdates }));
    setSaveSuccess(false);
    setSaveError(null);

    if (providerChanged) {
      const selectedCredential = getSavedCredentialForProvider(
        savedCredentials,
        nextUpdates.aiProvider as WorkspaceSettings['aiProvider'],
      );

      setApiKeyState(selectedCredential ? 'stored' : 'cleared');
      setTestResult(null);
    } else if (nextUpdates.apiKey !== undefined) {
      setApiKeyState(nextUpdates.apiKey === '' ? 'cleared' : 'pending');
      setTestResult(null);
    }
    if (nextUpdates.aiProvider !== undefined) {
      setTestResult(null);
    }

    if (nextUpdates.ollamaEndpoint !== undefined) {
      setOllamaModels([]);
    }
  }, [savedCredentials]);

  const saveSettings = useCallback(async () => {
    if (!currentUser) {
      return;
    }

    setSaveLoading(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const keyAction = KEY_ACTION[apiKeyState];
      const normalizedApiKey = normalizeApiKeyInput(settings.apiKey).trim();
      const payload = {
        ...settings,
        keyAction,
        apiKey: keyAction === 'update' ? normalizedApiKey : undefined,
        ollamaModel: ollamaModels.length > 0 ? settings.ollamaModel : '',
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

      const normalized = normalizeWorkspaceSettings(
        data,
        DEFAULT_WORKSPACE_SETTINGS.defaultView,
        DEFAULT_WORKSPACE_SETTINGS.theme
      );
      setSettings(normalized);
      setOriginalSettings(normalized);
      setSavedCredentials(normalizeSavedCredentials(data.savedCredentials));
      setTheme(normalized.theme);
      setView(normalized.defaultView);
      setApiKeyState(normalized.apiKey === API_KEY_MASK ? 'stored' : 'cleared');
      setTestResult(null);
      setSaveSuccess(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save account settings.';
      setSaveError(message);
    } finally {
      setSaveLoading(false);
    }
  }, [currentUser, settings, apiKeyState, ollamaModels, setTheme, setView]);

  const resetProviderDraft = useCallback(() => {
    const selectedCredential = getSavedCredentialForProvider(savedCredentials, settings.aiProvider);

    setSettings((current) => ({
      ...current,
      apiKey: selectedCredential ? API_KEY_MASK : '',
    }));
    setApiKeyState(selectedCredential ? 'stored' : 'cleared');
    setTestResult(null);
    setSaveSuccess(false);
    setSaveError(null);
  }, [savedCredentials, settings.aiProvider]);

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
      agentIntegration: settings.agentIntegration,
      ollamaModel: settings.ollamaModel,
      ollamaEndpoint: settings.ollamaEndpoint,
    },
    {
      defaultView: baselineSettings.defaultView,
      theme: baselineSettings.theme,
      projectLayout: baselineSettings.projectLayout,
      agentIntegration: baselineSettings.agentIntegration,
      ollamaModel: baselineSettings.ollamaModel,
      ollamaEndpoint: baselineSettings.ollamaEndpoint,
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
    ollamaModels,
    ollamaModelsLoading,
    updateSettings,
    saveSettings,
    resetProviderDraft,
    testApiKey,
    resetTutorial,
    refreshOllamaModels,
    hasProviderChanges,
    hasChanges,
  };
}