import React, { createContext, useContext, useState, useLayoutEffect } from 'react';

export type ThemeMode = 'dark' | 'light';
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
      const saved = localStorage.getItem('ds-theme') as ThemeMode;
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
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
    root.setAttribute('data-theme', theme);
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

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    localStorage.setItem('ds-theme', newTheme);
  };

  const setDensity = (newDensity: DensityScale) => {
    setDensityState(newDensity);
    localStorage.setItem('ds-density', newDensity);
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

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
