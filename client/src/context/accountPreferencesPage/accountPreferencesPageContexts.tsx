import { JSX, type PropsWithChildren } from 'react';
import {
  AccountPreferencesCategoryContext,
  AccountPreferencesCloudContext,
  AccountPreferencesCloudContextValue,
  AccountPreferencesCategoryContextValue,
  AccountPreferencesNavigationContext,
  AccountPreferencesNavigationContextValue,
  AccountPreferencesOnboardingContext,
  AccountPreferencesOnboardingContextValue,
  AccountPreferencesRuntimeContext,
  AccountPreferencesRuntimeContextValue,
  AccountPreferencesSettingsContext,
  AccountPreferencesSettingsContextValue,
} from './accountPreferencesPageContextState';

export function AccountPreferencesRuntimeContextProvider({
  children,
  value,
}: PropsWithChildren<{ value: AccountPreferencesRuntimeContextValue }>): JSX.Element {
  return (
    <AccountPreferencesRuntimeContext.Provider value={value}>
      {children}
    </AccountPreferencesRuntimeContext.Provider>
  );
}

export function AccountPreferencesSettingsContextProvider({
  children,
  value,
}: PropsWithChildren<{ value: AccountPreferencesSettingsContextValue }>): JSX.Element {
  return (
    <AccountPreferencesSettingsContext.Provider value={value}>
      {children}
    </AccountPreferencesSettingsContext.Provider>
  );
}

export function AccountPreferencesCloudContextProvider({
  children,
  value,
}: PropsWithChildren<{ value: AccountPreferencesCloudContextValue }>): JSX.Element {
  return (
    <AccountPreferencesCloudContext.Provider value={value}>
      {children}
    </AccountPreferencesCloudContext.Provider>
  );
}

export function AccountPreferencesOnboardingContextProvider({
  children,
  value,
}: PropsWithChildren<{ value: AccountPreferencesOnboardingContextValue }>): JSX.Element {
  return (
    <AccountPreferencesOnboardingContext.Provider value={value}>
      {children}
    </AccountPreferencesOnboardingContext.Provider>
  );
}

export function AccountPreferencesNavigationContextProvider({
  children,
  value,
}: PropsWithChildren<{ value: AccountPreferencesNavigationContextValue }>): JSX.Element {
  return (
    <AccountPreferencesNavigationContext.Provider value={value}>
      {children}
    </AccountPreferencesNavigationContext.Provider>
  );
}

export function AccountPreferencesCategoryContextProvider({
  children,
  value,
}: PropsWithChildren<{ value: AccountPreferencesCategoryContextValue }>): JSX.Element {
  return (
    <AccountPreferencesCategoryContext.Provider value={value}>
      {children}
    </AccountPreferencesCategoryContext.Provider>
  );
}

export type { 
  AccountPreferencesCloudContextValue,
  AccountPreferencesCategoryContextValue,
  AccountPreferencesNavigationContextValue,
  AccountPreferencesOnboardingContextValue,
  AccountPreferencesRuntimeContextValue,
  AccountPreferencesSettingsContextValue,
} from './accountPreferencesPageContextState';
