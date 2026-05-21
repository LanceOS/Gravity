import React from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';

export type ThemeMode = 'light' | 'dark' | 'system';

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      return (window.localStorage.getItem('gravity_theme') as ThemeMode) || 'system';
    }
    return 'system';
  });

  const applyTheme = (targetTheme: ThemeMode) => {
    const root = document.documentElement;
    root.classList.remove('dark-theme', 'light-theme');
    root.removeAttribute('data-theme');

    let resolvedTheme: 'dark' | 'light' = 'light';
    if (targetTheme === 'system') {
      const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      resolvedTheme = systemIsDark ? 'dark' : 'light';
    } else {
      resolvedTheme = targetTheme;
    }

    if (resolvedTheme === 'dark') {
      root.classList.add('dark-theme');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.add('light-theme');
      root.setAttribute('data-theme', 'light');
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
        border: '1px solid var(--border)',
        cursor: 'pointer',
      }}
    >
      {theme === 'light' && <Sun size={15} style={{ color: 'var(--priority-medium)' }} />}
      {theme === 'dark' && <Moon size={15} style={{ color: 'var(--accent)' }} />}
      {theme === 'system' && <Laptop size={15} style={{ color: 'var(--text-muted)' }} />}
    </button>
  );
}
