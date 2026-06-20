export const THEME_MODES = [
  'dark',
  'coal-black',
  'coffee',
  'honey-glow',
  'marble-blue',
  'midnight-azure',
] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

export const DEFAULT_THEME: ThemeMode = 'marble-blue';

export const isThemeMode = (value: unknown): value is ThemeMode =>
  typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value);

export interface ThemeContextState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}
