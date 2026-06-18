import { afterEach, describe, expect, it, vi } from 'vitest';
import lightTheme from '@library/themes/light.json';
import noirTheme from '@library/themes/noir.json';
import coalBlackTheme from '@library/themes/coal-black.json';
import coffeeTheme from '@library/themes/coffee.json';
import honeyGlowTheme from '@library/themes/honey-glow.json';
import marbleBlueTheme from '@library/themes/marble-blue.json';
import midnightAzureTheme from '@library/themes/midnight-azure.json';
import { applyResolvedTheme, applyThemeConfig, validateThemeConfig } from '@library/utilities/themeEngine';

const THEME_FIXTURES = [
  {
    id: 'dark',
    fixture: noirTheme,
    expectedRootClass: 'dark-theme',
    isDark: true,
  },
  {
    id: 'coal-black',
    fixture: coalBlackTheme,
    expectedRootClass: 'coal-black-theme',
    isDark: true,
  },
  {
    id: 'coffee',
    fixture: coffeeTheme,
    expectedRootClass: 'coffee-theme',
    isDark: true,
  },
  {
    id: 'honey-glow',
    fixture: honeyGlowTheme,
    expectedRootClass: 'honey-glow-theme',
    isDark: false,
  },
  {
    id: 'marble-blue',
    fixture: marbleBlueTheme,
    expectedRootClass: 'marble-blue-theme',
    isDark: false,
  },
  {
    id: 'midnight-azure',
    fixture: midnightAzureTheme,
    expectedRootClass: 'midnight-azure-theme',
    isDark: true,
  },
] as const;

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

  it('validates every shipped theme contract', () => {
    THEME_FIXTURES.forEach(({ fixture }) => {
      expect(validateThemeConfig(fixture)).toEqual({ missing: [], unknown: [] });
      expect(fixture.colors.primary).toBeTypeOf('string');
      expect(fixture.colors.surfaceElevated).toBeTypeOf('string');
      applyThemeConfig(fixture);
      expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe(fixture.colors.primary);
      expect(document.documentElement.style.getPropertyValue('--color-surface-elevated')).toBe(fixture.colors.surfaceElevated);
      expect(document.documentElement.style.getPropertyValue('--color-overlay-scrim')).toBe(fixture.colors.overlayScrim);
    });
  });

  it.each(THEME_FIXTURES)('resolves and applies %s via applyResolvedTheme()', ({ id, fixture, expectedRootClass, isDark }) => {
    expect(applyResolvedTheme(id)).toBe(id);
    expect(document.documentElement.getAttribute('data-theme')).toBe(id);
    expect(document.documentElement.classList.contains(expectedRootClass)).toBe(true);
    expect(document.documentElement.classList.contains(isDark ? 'dark-theme' : 'light-theme')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe(fixture.colors.primary);
    expect(document.documentElement.style.getPropertyValue('--color-primary-hover')).toBe(fixture.colors.primaryHover);
    expect(document.documentElement.style.getPropertyValue('--color-text-primary')).toBe(fixture.colors.textPrimary);
  });
});
