import React from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { applyThemePreference, getStoredThemePreference, THEME_STORAGE_KEY, type ThemePreference } from '../../utilities/themeEngine';

export type ThemeMode = ThemePreference;

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<ThemeMode>(() => {
    return getStoredThemePreference();
  });

  const applyTheme = (targetTheme: ThemeMode) => {
    applyThemePreference(targetTheme, { persist: false });
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
    const modes: ThemeMode[] = ['marble-blue', 'dark', 'coal-black', 'coffee', 'midnight-azure', 'system'];
    const currentIndex = Math.max(0, modes.indexOf(theme));
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextTheme = modes[nextIndex];
    setTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
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
      {theme === 'marble-blue' && <Sun size={15} style={{ color: 'var(--color-text-secondary)' }} />}
      {(theme === 'dark' || theme === 'coal-black' || theme === 'coffee' || theme === 'midnight-azure') && (
        <Moon size={15} style={{ color: 'var(--color-primary)' }} />
      )}
      {theme === 'system' && <Laptop size={15} style={{ color: 'var(--color-text-disabled)' }} />}
    </button>
  );
}
