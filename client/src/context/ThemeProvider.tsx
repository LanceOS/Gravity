import React, { createContext, useContext, useState, useLayoutEffect } from 'react';
import { applyResolvedTheme, getStoredThemePreference, resolveThemePreference, THEME_STORAGE_KEY } from '@library/utilities/themeEngine';

export type ThemeMode = 'dark' | 'light' | 'coal-black';
export type DensityScale = 'compact' | 'standard';

interface ThemeContextType {
  theme: ThemeMode;
  density: DensityScale;
  setTheme: (theme: ThemeMode) => void;
  setDensity: (density: DensityScale) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      return resolveThemePreference(getStoredThemePreference());
    }
    return 'dark';
  });

  const [density, setDensityState] = useState<DensityScale>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ds-density') as DensityScale;
      return saved === 'standard' ? 'standard' : 'compact';
    }
    return 'compact';
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
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    }
  }, []);

  const setDensity = React.useCallback((newDensity: DensityScale) => {
    setDensityState(newDensity);
    localStorage.setItem('ds-density', newDensity);
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
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
