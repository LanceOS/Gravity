import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@library/styles/library.css'
import './index.css'
import App from './App.tsx'
import { applyThemeConfig } from '@library/utilities/themeEngine'
import lightTheme from '@library/themes/light.json'
import darkTheme from '@library/themes/dark.json'

// Apply initial theme early to prevent FOUC
const initialTheme = localStorage.getItem('gravity_theme') || 'system';
const isDark = initialTheme === 'dark' || (initialTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
applyThemeConfig(isDark ? darkTheme : lightTheme);
if (isDark) {
  document.documentElement.classList.add('dark-theme');
  document.documentElement.setAttribute('data-theme', 'dark');
} else {
  document.documentElement.classList.add('light-theme');
  document.documentElement.setAttribute('data-theme', 'light');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

