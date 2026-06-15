import { JSX } from 'react/jsx-runtime';
import { SettingsScreenContext, type SettingsScreenContextProviderProps } from './SettingsScreenContextState';

export function SettingsScreenContextProvider({
  value,
  children,
}: SettingsScreenContextProviderProps): JSX.Element {
  return <SettingsScreenContext.Provider value={value}>{children}</SettingsScreenContext.Provider>;
}
