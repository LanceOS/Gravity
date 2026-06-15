import { createContext, useContext, type ReactNode } from 'react';
import type { SettingsScreenProps } from '../types';

interface SettingsScreenContextValue extends SettingsScreenProps {
  isMobile: boolean;
}

const SettingsScreenContext = createContext<SettingsScreenContextValue | null>(null);

interface SettingsScreenContextProviderProps {
  value: Omit<SettingsScreenContextValue, 'children'>;
  children: ReactNode;
}

export function SettingsScreenContextProvider({
  value,
  children,
}: SettingsScreenContextProviderProps): JSX.Element {
  return <SettingsScreenContext.Provider value={value}>{children}</SettingsScreenContext.Provider>;
}

export function useSettingsScreenContext(): SettingsScreenContextValue {
  const context = useContext(SettingsScreenContext);

  if (context === null) {
    throw new Error('useSettingsScreenContext must be used within SettingsScreenContextProvider.');
  }

  return context;
}
