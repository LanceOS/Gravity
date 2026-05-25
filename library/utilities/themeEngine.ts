import lightTheme from '../themes/light.json';
import noirTheme from '../themes/noir.json';
import coalBlackTheme from '../themes/coal-black.json';
import coffeeTheme from '../themes/coffee.json';
import marbleBlueTheme from '../themes/marble-blue.json';

export const KNOWN_THEME_COLOR_KEYS = [
  'primary',
  'primaryHover',
  'primaryLight',
  'secondary',
  'secondaryHover',
  'secondaryLight',
  'success',
  'successLight',
  'successDark',
  'warning',
  'warningLight',
  'warningDark',
  'error',
  'errorLight',
  'errorDark',
  'info',
  'infoLight',
  'infoDark',
  'neutral',
  'neutralDark',
  'base0',
  'base50',
  'base100',
  'base200',
  'base300',
  'base400',
  'base500',
  'base600',
  'base700',
  'base800',
  'base900',
  'surface',
  'textPrimary',
  'textSecondary',
  'textBrand',
  'textSuccess',
  'textWarning',
  'textError',
  'textInfo',
  'textOnAccent',
  'textDisabled',
  'textPlaceholder',
  'textLink',
  'textInverse',
  'textCode',
  'surfaceApp',
  'surfaceCard',
  'surfaceElevated',
  'surfaceOverlay',
  'surfaceInput',
  'surfaceCode',
  'surfaceDisabled',
  'borderDefault',
  'borderFocus',
  'borderError',
  'borderDisabled',
  'borderSubtle',
  'bgSuccess',
  'bgWarning',
  'bgError',
  'bgInfo',
  'stateHoverOverlay',
  'statePressedOverlay',
  'stateFocusRing',
  'stateSelectedBg',
  'overlayScrim',
  'white',
  'black',
] as const;

export type ThemeColorKey = (typeof KNOWN_THEME_COLOR_KEYS)[number];

export type ThemeConfig = {
  colors: Partial<Record<ThemeColorKey, string>> & Record<string, string>;
};

export type ThemeValidationResult = {
  missing: ThemeColorKey[];
  unknown: string[];
};

export type ThemePreference = 'light' | 'dark' | 'coal-black' | 'coffee' | 'marble-blue' | 'system';
export type ResolvedThemeMode = 'light' | 'dark' | 'coal-black' | 'coffee' | 'marble-blue';

export const THEME_STORAGE_KEY = 'gravity_theme';

const knownThemeColorKeySet = new Set<string>(KNOWN_THEME_COLOR_KEYS);

export const normalizeThemePreference = (value: string | null | undefined): ThemePreference => {
  if (value === 'light' || value === 'dark' || value === 'coal-black' || value === 'coffee' || value === 'marble-blue' || value === 'system') {
    return value;
  }

  if (value === 'noir') {
    return 'dark';
  }

  return 'system';
};

export const getStoredThemePreference = (): ThemePreference => {
  if (typeof window === 'undefined') {
    return 'system';
  }

  return normalizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
};

export const resolveThemePreference = (preference: ThemePreference): ResolvedThemeMode => {
  if (preference !== 'system') {
    return preference;
  }

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const shouldWarnOnThemeIssues = () => {
  if (typeof window === 'undefined') {
    return true;
  }

  return window.location.hostname === '' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
};

/**
 * Converts a camelCase or PascalCase string to kebab-case.
 * e.g., 'primaryHover' -> 'primary-hover'
 */
const toKebabCase = (str: string) => {
  return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
};

export const validateThemeConfig = (theme: ThemeConfig): ThemeValidationResult => {
  const colors = theme.colors ?? {};

  return {
    missing: KNOWN_THEME_COLOR_KEYS.filter((key) => typeof colors[key] !== 'string'),
    unknown: Object.keys(colors).filter((key) => !knownThemeColorKeySet.has(key)),
  };
};

/**
 * Applies a theme configuration to the document root as CSS variables.
 * @param theme The JSON theme configuration (e.g., imported from light.json)
 */
export const applyThemeConfig = (theme: ThemeConfig) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const colors = theme.colors ?? {};
  const { missing, unknown } = validateThemeConfig(theme);

  if (shouldWarnOnThemeIssues()) {
    if (missing.length > 0) {
      console.warn(`[themeEngine] Missing theme color tokens: ${missing.join(', ')}`);
    }

    if (unknown.length > 0) {
      console.warn(`[themeEngine] Unrecognized theme color tokens: ${unknown.join(', ')}`);
    }
  }

  KNOWN_THEME_COLOR_KEYS.forEach((key) => {
    const cssVarName = `--color-${toKebabCase(key)}`;
    const value = colors[key];

    if (typeof value === 'string') {
      root.style.setProperty(cssVarName, value);
    } else {
      root.style.removeProperty(cssVarName);
    }
  });

  Object.keys(colors).forEach((key) => {
    if (!knownThemeColorKeySet.has(key)) {
      root.style.removeProperty(`--color-${toKebabCase(key)}`);
    }
  });
};

export const applyResolvedTheme = (resolvedTheme: ResolvedThemeMode) => {
  if (typeof document === 'undefined') {
    return resolvedTheme;
  }

  const root = document.documentElement;

  root.classList.remove('dark-theme', 'light-theme', 'noir-theme', 'coal-black-theme', 'coffee-theme', 'marble-blue-theme');
  root.removeAttribute('data-theme');

  if (resolvedTheme === 'dark') {
    root.classList.add('noir-theme', 'dark-theme');
    root.setAttribute('data-theme', 'dark');
    applyThemeConfig(noirTheme);
  } else if (resolvedTheme === 'coal-black') {
    root.classList.add('coal-black-theme', 'dark-theme');
    root.setAttribute('data-theme', 'coal-black');
    applyThemeConfig(coalBlackTheme);
  } else if (resolvedTheme === 'coffee') {
    root.classList.add('coffee-theme', 'dark-theme');
    root.setAttribute('data-theme', 'coffee');
    applyThemeConfig(coffeeTheme);
  } else if (resolvedTheme === 'marble-blue') {
    root.classList.add('marble-blue-theme', 'light-theme');
    root.setAttribute('data-theme', 'marble-blue');
    applyThemeConfig(marbleBlueTheme);
  } else {
    root.classList.add('light-theme');
    root.setAttribute('data-theme', 'light');
    applyThemeConfig(lightTheme);
  }

  return resolvedTheme;
};

export const applyThemePreference = (preference: ThemePreference, options?: { persist?: boolean }) => {
  const resolvedTheme = applyResolvedTheme(resolveThemePreference(preference));

  if (options?.persist !== false && typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  }

  return resolvedTheme;
};
