import { useContext } from 'react';
import {
  SettingsScreenContext,
  type SettingsScreenContextValue,
} from './SettingsScreenContextState';

export function useSettingsScreenContext(): SettingsScreenContextValue {
  const context = useContext(SettingsScreenContext);

  if (context === null) {
    throw new Error('useSettingsScreenContext must be used within SettingsScreenContextProvider.');
  }

  return context;
}
