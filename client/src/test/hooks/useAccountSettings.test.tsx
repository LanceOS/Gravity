import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAccountSettings } from '../../hooks/useAccountSettings.ts';
import { API_KEY_MASK } from '../../utils/settings.ts';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useAccountSettings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies saved account settings on load without refetching when local view or theme props change', async () => {
    const currentUser = {
      id: 'user-settings-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      avatar: '',
      role: 'owner',
      tutorial_completed: 1,
    };
    const setTheme = vi.fn();
    const setView = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        jsonResponse({
          userId: currentUser.id,
          defaultView: 'list',
          theme: 'coffee',
          ollamaModel: 'llama3.2',
          ollamaEndpoint: 'http://ollama.internal:11434',
          projectLayout: 'condensed',
          apiKey: API_KEY_MASK,
          aiProvider: 'anthropic',
          savedCredentials: [
            { provider: 'openai', apiKey: API_KEY_MASK },
            { provider: 'anthropic', apiKey: API_KEY_MASK },
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ models: ['llama3.2'] }));

    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      (props: {
        activeView: 'board' | 'list';
        theme: 'dark' | 'coal-black' | 'coffee' | 'marble-blue';
      }) =>
        useAccountSettings({
          currentUser,
          activeView: props.activeView,
          theme: props.theme,
          setTheme,
          setView,
        }),
      {
        initialProps: {
          activeView: 'board',
          theme: 'dark',
        },
      }
    );

    await waitFor(() => {
      expect(result.current.settingsLoading).toBe(false);
      expect(result.current.settings.defaultView).toBe('list');
    });

    expect(result.current.settings).toMatchObject({
      defaultView: 'list',
      theme: 'coffee',
      projectLayout: 'condensed',
      aiProvider: 'anthropic',
      ollamaModel: 'llama3.2',
    });
    expect(result.current.savedCredentials).toHaveLength(2);
    expect(setTheme).toHaveBeenCalledWith('coffee');
    expect(setView).toHaveBeenCalledWith('list');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.updateSettings({ aiProvider: 'openai' });
    });

    expect(result.current.settings.aiProvider).toBe('openai');
    expect(result.current.settings.apiKey).toBe(API_KEY_MASK);

    rerender({ activeView: 'list', theme: 'coffee' });

    await waitFor(() => {
      expect(result.current.settings.defaultView).toBe('list');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});