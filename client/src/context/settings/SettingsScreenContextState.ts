import { createContext, type Context, type ReactNode } from 'react';
import type { SettingsScreenProps } from '../../modules/settings/types';

export interface SettingsScreenContextValue extends SettingsScreenProps {
  isMobile: boolean;
}

export const SettingsScreenContext: Context<SettingsScreenContextValue | null> = createContext<SettingsScreenContextValue | null>(null);

export interface SettingsScreenContextProviderProps {
  value: Omit<SettingsScreenContextValue, 'children'>;
  children: ReactNode;
}
