import { useMemo, type FC, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { CommentProvider, useCommentContext } from './comment/CommentContext';
import { CycleProvider } from './cycle/CycleContext';
import { TicketFiltersProvider } from './filters/TicketFiltersContext';
import { LabelProvider } from './label/LabelContext';
import { ProjectProvider, useProjectContext } from './project/ProjectContext';
import { ActiveProjectProvider } from './project/ActiveProjectContext';
import { TicketRelationsProvider, useTicketRelationsContext } from './relation/TicketRelationsContext';
import { RealtimeProvider } from './realtime/RealtimeContext';
import { ThemeProvider as AppThemeProvider } from './theme/ThemeContext';
import { TicketContext } from './TicketContextContext';
import { TicketDetailProvider } from './ticket/TicketDetailContext';
import { TicketListProvider, useTicketListContext } from './ticket/TicketListContext';
import { TicketMutationProvider } from './ticket/TicketMutationContext';
import { ActiveViewProvider } from './ui/ActiveViewContext';
import { UserDirectoryProvider, useUserDirectory } from './user/UserDirectoryContext';
import type { TicketContextType } from './TicketContext.types';
import { ThemeProvider as SettingsThemeProvider } from '../modules/settings/components/ThemeProvider';

export type * from './TicketContext.types';

const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <AppThemeProvider>
      <SettingsThemeProvider>{children}</SettingsThemeProvider>
    </AppThemeProvider>
  );
};

const CompatibilityTicketProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser, loading: authLoading } = useAuth();
  const { projectsLoading } = useProjectContext();
  const { users, isLoading: usersLoading } = useUserDirectory();
  const { tickets, activeTicket, setActiveTicket, ticketMap } = useTicketListContext();
  const { addComment, updateComment, deleteComment } = useCommentContext();
  const {
    addTicketDependency,
    removeTicketDependency,
    addTicketBlocker,
    removeTicketBlocker,
  } = useTicketRelationsContext();

  const loading = authLoading || projectsLoading || usersLoading;

  const value = useMemo<TicketContextType>(
    () => ({
      tickets,
      users,
      activeTicket,
      currentUser,
      loading,
      addComment,
      updateComment,
      deleteComment,
      addTicketDependency,
      removeTicketDependency,
      addTicketBlocker,
      removeTicketBlocker,
      setActiveTicket,
      ticketMap,
    }),
    [
      tickets,
      users,
      activeTicket,
      currentUser,
      loading,
      addComment,
      updateComment,
      deleteComment,
      addTicketDependency,
      removeTicketDependency,
      addTicketBlocker,
      removeTicketBlocker,
      setActiveTicket,
      ticketMap,
    ],
  );

  return <TicketContext.Provider value={value}>{children}</TicketContext.Provider>;
};

export const AppContextProviders: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ActiveViewProvider>{children}</ActiveViewProvider>
      </ThemeProvider>
    </AuthProvider>
  );
};

export const ProjectContextProviders: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <ActiveProjectProvider>
      <ProjectProvider>{children}</ProjectProvider>
    </ActiveProjectProvider>
  );
};

export const WorkspaceTicketStateProviders: FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();

  return (
    <TicketFiltersProvider>
      <UserDirectoryProvider>
        <TicketListProvider currentUser={currentUser}>{children}</TicketListProvider>
      </UserDirectoryProvider>
    </TicketFiltersProvider>
  );
};

export const WorkspaceTicketMetadataProviders: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <CycleProvider>
      <LabelProvider>{children}</LabelProvider>
    </CycleProvider>
  );
};

export const WorkspaceTicketActionProviders: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <TicketDetailProvider>
      <TicketMutationProvider>
        <CommentProvider>
          <TicketRelationsProvider>{children}</TicketRelationsProvider>
        </CommentProvider>
      </TicketMutationProvider>
    </TicketDetailProvider>
  );
};

export const WorkspaceTicketRealtimeProviders: FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();

  return (
    <RealtimeProvider currentUserId={currentUser?.id ?? null}>{children}</RealtimeProvider>
  );
};

export const WorkspaceTicketProviders: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <WorkspaceTicketStateProviders>
      <WorkspaceTicketMetadataProviders>
        <WorkspaceTicketRealtimeProviders>{children}</WorkspaceTicketRealtimeProviders>
      </WorkspaceTicketMetadataProviders>
    </WorkspaceTicketStateProviders>
  );
};

export const TicketProvider: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <AppContextProviders>
      <ProjectContextProviders>
        <WorkspaceTicketProviders>
          <WorkspaceTicketActionProviders>
            <CompatibilityTicketProvider>{children}</CompatibilityTicketProvider>
          </WorkspaceTicketActionProviders>
        </WorkspaceTicketProviders>
      </ProjectContextProviders>
    </AppContextProviders>
  );
};
