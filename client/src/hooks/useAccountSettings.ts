import { useCallback, useEffect, useState } from 'react';
import type { User } from '../context/TicketContext';
import {
  DEFAULT_WORKSPACE_SETTINGS,
  getProviderOption,
  normalizeWorkspaceSettings,
  type WorkspaceSettings,
} from '../utils/settings';

interface StatusMessage {
  success: boolean;
  message: string;
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

  useEffect(() => {
    if (!saveSuccess) {
      return undefined;
    }

    const timer = window.setTimeout(() => setSaveSuccess(false), 2000);
    return () => window.clearTimeout(timer);
  }, [saveSuccess]);

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
    setSettingsHydrated(false);
  }, [currentUser, activeView, theme]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    let cancelled = false;
    setSettingsLoading(true);
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
          setTheme(normalized.theme);
          setView(normalized.defaultView);
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

    void refreshOllamaModels(settings.ollamaEndpoint);
  }, [currentUser, settings.ollamaEndpoint, settingsHydrated, refreshOllamaModels]);

  const updateSettings = useCallback((updates: Partial<WorkspaceSettings>) => {
    setSettings((current) => ({ ...current, ...updates }));
    setSaveSuccess(false);
    setSaveError(null);

    if (updates.apiKey !== undefined || updates.aiProvider !== undefined) {
      setTestResult(null);
    }

    if (updates.ollamaEndpoint !== undefined) {
      setOllamaModels([]);
    }
  }, []);

  const saveSettings = useCallback(async () => {
    if (!currentUser) {
      return;
    }

    setSaveLoading(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const payload = {
        ...settings,
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
      setTheme(normalized.theme);
      setView(normalized.defaultView);
      setSaveSuccess(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save account settings.';
      setSaveError(message);
    } finally {
      setSaveLoading(false);
    }
  }, [currentUser, settings, ollamaModels, setTheme, setView]);

  const testApiKey = useCallback(async () => {
    const provider = getProviderOption(settings.aiProvider);
    if (!settings.apiKey.trim()) {
      setTestResult({ success: false, message: `Please enter a ${provider.label} API key to test.` });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/v1/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: settings.aiProvider, api_key: settings.apiKey.trim() }),
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
  }, [settings.aiProvider, settings.apiKey]);

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
  const hasChanges = !shallowEqual(settings, baselineSettings);

  return {
    settings,
    settingsLoading,
    saveLoading,
    saveSuccess,
    saveError,
    testing,
    testResult,
    tutorialResult,
    ollamaModels,
    ollamaModelsLoading,
    updateSettings,
    saveSettings,
    testApiKey,
    resetTutorial,
    refreshOllamaModels,
    hasChanges,
  };
}