import { afterEach, describe, expect, it, vi } from 'vitest';
import { redirectToOAuthClient } from '../../modules/mcpOAuth/api';

afterEach(() => vi.unstubAllGlobals());

describe('OAuth callback navigation', () => {
  it.each([
    'https://chatgpt.com/callback?code=opaque-code&state=a%2Bb',
    'http://localhost:3000/callback?code=opaque-code',
    'http://127.0.0.1:3000/callback?code=opaque-code',
    'http://[::1]:3000/callback?code=opaque-code',
  ])('navigates to a supported server-validated callback: %s', callback => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    redirectToOAuthClient(callback);
    expect(assign).toHaveBeenCalledExactlyOnceWith(callback);
  });

  it.each(['javascript:alert(1)', 'data:text/html,unsafe', 'http://remote.example/callback', 'http://localhost.evil.example/callback'])('rejects unsupported callback URLs: %s', callback => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    expect(() => redirectToOAuthClient(callback)).toThrow('unsupported callback address');
    expect(assign).not.toHaveBeenCalled();
  });
});
