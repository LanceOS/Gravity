import React from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { applyThemeConfig } from '../../utilities/themeEngine';
import lightTheme from '../../themes/light.json';
import noirTheme from '../../themes/noir.json';

export type ThemeMode = 'light' | 'dark' | 'system';

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = window.localStorage.getItem('gravity_theme');
      if (savedTheme === 'noir') {
        return 'dark';
      }
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
        return savedTheme;
      }
      return 'system';
    }
    return 'system';
  });

  const applyTheme = (targetTheme: ThemeMode) => {
    const root = document.documentElement;
    root.classList.remove('dark-theme', 'light-theme', 'noir-theme');
    root.removeAttribute('data-theme');

    let resolvedTheme: 'dark' | 'light' = 'light';
    if (targetTheme === 'system') {
      const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      resolvedTheme = systemIsDark ? 'dark' : 'light';
    } else {
      resolvedTheme = targetTheme;
    }

    if (resolvedTheme === 'dark') {
      root.classList.add('noir-theme', 'dark-theme');
      root.setAttribute('data-theme', 'dark');
      applyThemeConfig(noirTheme);
    } else {
      root.classList.add('light-theme');
      root.setAttribute('data-theme', 'light');
      applyThemeConfig(lightTheme);
    }
  };

  React.useEffect(() => {
    applyTheme(theme);

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleSystemChange = () => applyTheme('system');
      mediaQuery.addEventListener('change', handleSystemChange);
      return () => mediaQuery.removeEventListener('change', handleSystemChange);
    }
  }, [theme]);

  const toggleTheme = () => {
    const modes: ThemeMode[] = ['light', 'dark', 'system'];
    const currentIndex = modes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextTheme = modes[nextIndex];
    setTheme(nextTheme);
    window.localStorage.setItem('gravity_theme', nextTheme);
  };

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm clickable"
      onClick={toggleTheme}
      aria-label={`Current theme: ${theme}. Click to change.`}
      title={`Theme: ${theme}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px',
        minHeight: '32px',
        width: '32px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border-default)',
        cursor: 'pointer',
      }}
    >
      {theme === 'light' && <Sun size={15} style={{ color: 'var(--color-text-secondary)' }} />}
      {theme === 'dark' && <Moon size={15} style={{ color: 'var(--color-primary)' }} />}
      {theme === 'system' && <Laptop size={15} style={{ color: 'var(--color-text-disabled)' }} />}
    </button>
  );
}
