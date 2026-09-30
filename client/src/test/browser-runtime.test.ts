import { describe, expect, it } from 'vitest';

describe('supported jsdom runtime', () => {
  it.each(['localStorage', 'sessionStorage'] as const)(
    'provides browser %s without Node runtime flags', (name) => {
      const storage = window[name];
      const key = 'grav-246-runtime-probe';
      try {
        expect(globalThis[name]).toBe(storage);
        storage.setItem(key, 'browser-value');
        expect(storage.getItem(key)).toBe('browser-value');
      } finally {
        storage.removeItem(key);
      }
    },
  );

  it('propagates cancellation through Request and DOM event listeners', () => {
    const controller = new AbortController();
    const request = new Request('https://example.invalid/runtime-probe', {
      signal: controller.signal,
    });
    const button = document.createElement('button');
    let clicks = 0;
    button.addEventListener('click', () => { clicks += 1; }, { signal: controller.signal });
    button.click();
    expect(clicks).toBe(1);
    expect(request.signal.aborted).toBe(false);

    controller.abort();
    expect(request.signal.aborted).toBe(true);
    button.click();
    expect(clicks).toBe(1);
  });
});
