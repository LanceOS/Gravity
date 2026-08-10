(() => {
  const THEME_STORAGE_KEY = 'gravity_theme';
  const VIEW_STORAGE_KEY = 'gravity_active_view';
  const root = document.documentElement;

  const readThemePreference = () => {
    try {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

      if (
        storedTheme === 'dark' ||
        storedTheme === 'coal-black' ||
        storedTheme === 'coffee' ||
        storedTheme === 'honey-glow' ||
        storedTheme === 'marble-blue' ||
        storedTheme === 'midnight-azure'
      ) {
        return storedTheme;
      }
    } catch {
      // localStorage may be unavailable in restricted/private modes.
    }

    return 'system';
  };

  const readViewPreference = () => {
    try {
      const storedView = window.localStorage.getItem(VIEW_STORAGE_KEY);
      return storedView === 'list' || storedView === 'board' ? storedView : 'board';
    } catch {
      return 'board';
    }
  };

  const isDarkTheme = (preference) => {
    if (preference === 'system') {
      return !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    return ['dark', 'coal-black', 'coffee', 'midnight-azure'].includes(preference);
  };

  const bootstrapTheme = () => {
    const preference = readThemePreference();
    const resolvedTheme = preference === 'system'
      ? (isDarkTheme('system') ? 'dark' : 'marble-blue')
      : preference;

    root.classList.remove(
      'dark-theme',
      'light-theme',
      'noir-theme',
      'coal-black-theme',
      'coffee-theme',
      'honey-glow-theme',
      'marble-blue-theme',
      'midnight-azure-theme',
    );
    root.removeAttribute('data-theme');

    if (isDarkTheme(resolvedTheme)) {
      root.classList.add('dark-theme');
      root.setAttribute('data-theme', resolvedTheme === 'dark' ? 'dark' : resolvedTheme);
    } else {
      root.classList.add('light-theme');
      root.setAttribute('data-theme', resolvedTheme);
    }

    root.dataset.initialView = readViewPreference();
  };

  // Exposed only so the same production asset can be exercised in unit tests.
  window.gravityBootstrapTheme = bootstrapTheme;
  bootstrapTheme();
})();
