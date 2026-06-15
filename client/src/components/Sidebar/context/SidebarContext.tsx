import { createContext, useContext, type ReactNode } from 'react';
import type { SidebarViewModel } from '../hooks/useSidebarViewModel';
import type { SidebarProjectSection } from '../types';

interface SidebarContextValue extends SidebarViewModel {
  section: SidebarProjectSection;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

interface SidebarProviderProps {
  section: SidebarProjectSection;
  viewModel: SidebarViewModel;
  children: ReactNode;
}

export function SidebarProvider({ section, viewModel, children }: SidebarProviderProps) {
  return (
    <SidebarContext.Provider value={{ section, ...viewModel }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarContext() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebarContext must be used within a SidebarProvider');
  }

  return context;
}

export function useOptionalSidebarContext() {
  return useContext(SidebarContext);
}
