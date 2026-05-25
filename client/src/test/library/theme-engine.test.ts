import { afterEach, describe, expect, it, vi } from 'vitest';
import lightTheme from '@library/themes/light.json';
import { applyThemeConfig, validateThemeConfig } from '@library/utilities/themeEngine';

describe('library theme engine', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('style');
    vi.restoreAllMocks();
  });

  it('applies a complete theme contract without validation warnings', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(validateThemeConfig(lightTheme)).toEqual({ missing: [], unknown: [] });

    applyThemeConfig(lightTheme);

    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#2563EB');
    expect(document.documentElement.style.getPropertyValue('--color-surface-elevated')).toBe('rgba(255, 255, 255, 0.92)');
    expect(document.documentElement.style.getPropertyValue('--color-overlay-scrim')).toBe('rgba(9, 9, 11, 0.7)');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns and clears stale variables for incomplete or unrecognized themes', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    applyThemeConfig(lightTheme);
    applyThemeConfig({
      colors: {
        primary: '#123456',
        surprise: '#abcdef',
      },
    });

    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#123456');
    expect(document.documentElement.style.getPropertyValue('--color-primary-hover')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--color-surprise')).toBe('');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Missing theme color tokens'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unrecognized theme color tokens'));
  });
});