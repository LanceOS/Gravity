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

const knownThemeColorKeySet = new Set<string>(KNOWN_THEME_COLOR_KEYS);

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
