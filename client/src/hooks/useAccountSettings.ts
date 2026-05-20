import { useCallback, useEffect, useState } from 'react';
import type { User } from '../context/TicketContext';
import {
  getProviderOption,
  normalizeWorkspaceSettings,
  type WorkspaceSettings,
} from '../utils/settings';

interface StatusMessage {
  success: boolean;
  message: string;
}

interface UseAccountSettingsOptions {
  currentUser: User | null;
  activeView: 'board' | 'list';
  theme: 'dark' | 'light';
  setView: (view: 'board' | 'list') => void;
  setTheme: (theme: 'dark' | 'light') => void;
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
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<StatusMessage | null>(null);
  const [tutorialResult, setTutorialResult] = useState<StatusMessage | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);

  useEffect(() => {
    if (!saveSuccess) {
      return undefined;
    }

    const timer = window.setTimeout(() => setSaveSuccess(false), 2000);
    return () => window.clearTimeout(timer);
  }, [saveSuccess]);

  useEffect(() => {
    if (!currentUser) {
      setSettings(normalizeWorkspaceSettings(null, activeView, theme));
      setSaveError(null);
      setTestResult(null);
      setTutorialResult(null);
      setOllamaModels([]);
      return;
    }

    let cancelled = false;
    setSettingsLoading(true);

    fetch(`/api/settings/${currentUser.id}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load account settings.');
        }
        return data;
      })
      .then((data) => {
        if (!cancelled) {
          setSettings(normalizeWorkspaceSettings(data, activeView, theme));
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
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, activeView, theme]);

  const refreshOllamaModels = useCallback(async (endpoint?: string) => {
    const ollamaUrl = (endpoint ?? settings.ollamaEndpoint).trim();
    if (!ollamaUrl) {
      setOllamaModels([]);
      return;
    }

    setOllamaModelsLoading(true);
    try {
      const response = await fetch(`/api/ollama/models?ollamaUrl=${encodeURIComponent(ollamaUrl)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to detect Ollama models.');
      }

      const nextModels = Array.isArray(data.models)
        ? data.models.filter((model: unknown): model is string => typeof model === 'string' && model.length > 0)
        : [];

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
    if (!currentUser) {
      return;
    }

    void refreshOllamaModels(settings.ollamaEndpoint);
  }, [currentUser, settings.ollamaEndpoint, refreshOllamaModels]);

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

      const response = await fetch(`/api/settings/${currentUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save account settings.');
      }

      const normalized = normalizeWorkspaceSettings(data, activeView, theme);
      setSettings(normalized);
      setTheme(normalized.theme);
      setView(normalized.defaultView);
      setSaveSuccess(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save account settings.';
      setSaveError(message);
    } finally {
      setSaveLoading(false);
    }
  }, [currentUser, settings, ollamaModels, activeView, theme, setTheme, setView]);

  const testApiKey = useCallback(async () => {
    const provider = getProviderOption(settings.aiProvider);
    if (!settings.apiKey.trim()) {
      setTestResult({ success: false, message: `Please enter a ${provider.label} API key to test.` });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/ai/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: settings.aiProvider, apiKey: settings.apiKey.trim() }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Connection test failed.');
      }

      setTestResult({ success: true, message: data.message });
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
      const response = await fetch(`/api/users/${currentUser.id}/tutorial`, {
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
  };
}