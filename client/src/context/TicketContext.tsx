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

const OrderedTicketProviders: FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();

  return (
    <ActiveProjectProvider>
      <ProjectProvider>
        <ActiveViewProvider>
          <TicketFiltersProvider>
            <UserDirectoryProvider>
              <CycleProvider>
                <LabelProvider>
                  <TicketListProvider currentUser={currentUser}>
                    <TicketDetailProvider>
                      <TicketMutationProvider>
                        <CommentProvider>
                          <TicketRelationsProvider>
                            <RealtimeProvider currentUserId={currentUser?.id ?? null}>
                              <CompatibilityTicketProvider>{children}</CompatibilityTicketProvider>
                            </RealtimeProvider>
                          </TicketRelationsProvider>
                        </CommentProvider>
                      </TicketMutationProvider>
                    </TicketDetailProvider>
                  </TicketListProvider>
                </LabelProvider>
              </CycleProvider>
            </UserDirectoryProvider>
          </TicketFiltersProvider>
        </ActiveViewProvider>
      </ProjectProvider>
    </ActiveProjectProvider>
  );
};

export const TicketProvider: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <AuthProvider>
      <ThemeProvider>
        <OrderedTicketProviders>{children}</OrderedTicketProviders>
      </ThemeProvider>
    </AuthProvider>
  );
};
