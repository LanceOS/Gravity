export type ThemeConfig = {
  colors: Record<string, string>;
};

/**
 * Converts a camelCase or PascalCase string to kebab-case.
 * e.g., 'primaryHover' -> 'primary-hover'
 */
const toKebabCase = (str: string) => {
  return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
};

/**
 * Applies a theme configuration to the document root as CSS variables.
 * @param theme The JSON theme configuration (e.g., imported from light.json)
 */
export const applyThemeConfig = (theme: ThemeConfig) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // Flatten and inject colors
  if (theme.colors) {
    Object.entries(theme.colors).forEach(([key, value]) => {
      const cssVarName = `--color-${toKebabCase(key)}`;
      root.style.setProperty(cssVarName, value);
    });
  }
};
