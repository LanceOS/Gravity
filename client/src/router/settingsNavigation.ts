import type { Location, NavigateFunction } from 'react-router-dom';

const SETTINGS_HISTORY_ENTRY = 'gravitySettingsHistoryEntry';
export const settingsHistoryState = { [SETTINGS_HISTORY_ENTRY]: true };

export function openSettings(navigate: NavigateFunction, destination: string) {
  navigate(destination, { state: settingsHistoryState });
}

export function backFromSettings(navigate: NavigateFunction, location: Location, fallback: string) {
  const state = location.state;
  const historyIndex = window.history.state?.idx;
  if (
    state && typeof state === 'object' && state[SETTINGS_HISTORY_ENTRY] === true &&
    typeof historyIndex === 'number' && historyIndex > 0
  ) {
    navigate(-1);
    return;
  }

  navigate(fallback, { replace: true });
}
