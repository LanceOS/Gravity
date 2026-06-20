import React, { createContext, useContext, useLayoutEffect, useState } from 'react';
import { applyThemePreference, getStoredThemePreference, resolveThemePreference, THEME_STORAGE_KEY } from '@library/utilities/themeEngine';
import { DEFAULT_THEME, type ThemeContextState, type ThemeMode } from './ThemeContext.types';

const ThemeContext = createContext<ThemeContextState | undefined>(undefined);

function safeWriteStorageValue(key: string, value: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage may be unavailable in restricted/private modes.
  }
}

function readInitialTheme(): ThemeMode {
  try {
    return resolveThemePreference(getStoredThemePreference());
  } catch {
    return DEFAULT_THEME;
  }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => readInitialTheme());

  useLayoutEffect(() => {
    applyThemePreference(theme, { persist: false });
  }, [theme]);

  const setTheme = React.useCallback((nextTheme: ThemeMode) => {
    setThemeState((currentTheme) => (currentTheme === nextTheme ? currentTheme : nextTheme));
    safeWriteStorageValue(THEME_STORAGE_KEY, nextTheme);
  }, []);

  const value = React.useMemo(
    () => ({
      theme,
      setTheme,
    }),
    [theme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider.');
  }

  return context;
};

export { ThemeContext };
export type { ThemeMode } from './ThemeContext.types';
