import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@library/styles/library.css'
import './index.css'
import App from './App.tsx'
import { applyThemePreference, getStoredThemePreference } from '@library/utilities/themeEngine'

// Apply initial theme early to prevent FOUC
applyThemePreference(getStoredThemePreference(), { persist: false });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

