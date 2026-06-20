import React, { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react';
import { useTheme as useAppTheme } from '../../../context/theme/ThemeContext';
import type { ThemeMode as AppThemeMode } from '../../../context/theme/ThemeContext.types';

export type DensityScale = 'compact' | 'standard';

interface ThemeContextType {
  theme: AppThemeMode;
  density: DensityScale;
  setTheme: (theme: AppThemeMode) => void;
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
  const { theme, setTheme } = useAppTheme();
  const [density, setDensityState] = useState<DensityScale>(() => safeReadDensitySetting());

  useLayoutEffect(() => {
    const root = document.documentElement;
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
  }, [density]);

  const setDensity = React.useCallback((newDensity: DensityScale) => {
    setDensityState(newDensity);
    safeWriteStorageValue('ds-density', newDensity);
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === 'dark' ? 'coal-black' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({
      theme,
      density,
      setTheme,
      setDensity,
      toggleTheme,
    }),
    [theme, density, setTheme, setDensity, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
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

export type { ThemeMode } from '../../../context/theme/ThemeContext.types';
