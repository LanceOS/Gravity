import React, { createContext, useContext, useState, useLayoutEffect } from 'react';
import { applyResolvedTheme, getStoredThemePreference, resolveThemePreference, THEME_STORAGE_KEY } from '@library/utilities/themeEngine';

export type ThemeMode = 'dark' | 'coal-black' | 'coffee' | 'marble-blue';
export type DensityScale = 'compact' | 'standard';

interface ThemeContextType {
  theme: ThemeMode;
  density: DensityScale;
  setTheme: (theme: ThemeMode) => void;
  setDensity: (density: DensityScale) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function safeReadDensitySetting(): DensityScale {
  if (typeof window === 'undefined') {
    return 'compact';
  }

  try {
    const saved = window.localStorage.getItem('ds-density') as DensityScale;
    return saved === 'standard' ? 'standard' : 'compact';
  } catch {
    return 'compact';
  }
}

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

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      try {
        return resolveThemePreference(getStoredThemePreference());
      } catch {
        return 'marble-blue';
      }
    }
    return 'marble-blue';
  });

  const [density, setDensityState] = useState<DensityScale>(() => {
    return safeReadDensitySetting();
  });

  useLayoutEffect(() => {
    const root = document.documentElement;
    applyResolvedTheme(theme);
    root.setAttribute('data-density', density);
    
    // Inject dynamic CSS spacing variables based on density scaling
    if (density === 'compact') {
      root.style.setProperty('--space-base-multiplier', '0.75');
      root.style.setProperty('--table-row-height', '26px');
      root.style.setProperty('--input-padding-y', '2px');
    } else {
      root.style.setProperty('--space-base-multiplier', '1.0');
      root.style.setProperty('--table-row-height', '36px');
      root.style.setProperty('--input-padding-y', '6px');
    }
  }, [theme, density]);

  const setTheme = React.useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    safeWriteStorageValue(THEME_STORAGE_KEY, newTheme);
  }, []);

  const setDensity = React.useCallback((newDensity: DensityScale) => {
    setDensityState(newDensity);
    safeWriteStorageValue('ds-density', newDensity);
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === 'dark' ? 'coal-black' : 'dark');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, density, setTheme, setDensity, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be executed within a ThemeProvider wrapper.');
  }
  return context;
};
