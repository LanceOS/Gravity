import { useMemo, type Dispatch, type FC, type ReactNode, type SetStateAction } from 'react';

import { ThemeProvider as AppThemeProvider } from './theme/ThemeContext';
import { ThemeProvider as SettingsThemeProvider } from '../modules/settings';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ActiveProjectProvider } from './project/ActiveProjectContext';
import { ProjectProvider } from './project/ProjectContext';
import { ActiveViewProvider } from './ui/ActiveViewContext';
import { TicketFiltersProvider } from './filters/TicketFiltersContext';
import { UserDirectoryProvider, useUserDirectory } from './user/UserDirectoryContext';
import { CycleProvider } from './cycle/CycleContext';
import { LabelProvider } from './label/LabelContext';
import { TicketListProvider, useTicketList } from './ticket/TicketListContext';
import { TicketDetailProvider } from './ticket/TicketDetailContext';
import { TicketMutationProvider } from './ticket/TicketMutationContext';
import { CommentProvider, useCommentContext } from './comment/CommentContext';
import { TicketRelationsProvider, useTicketRelationsContext } from './relation/TicketRelationsContext';
import { RealtimeProvider } from './realtime/RealtimeContext';
import { TicketContext } from './TicketContextContext';
import { useActiveTicket } from './ticket/ActiveTicketContext';
import { useProjectContext } from './project/ProjectContext';
import type {
  User,
  Ticket,
  Comment,
} from '../types/domain';

type LegacyTicketState = {
  tickets: Ticket[];
  users: User[];
  activeTicket: Ticket | null;
  currentUser: User | null;
  loading: boolean;
};

export interface TicketContextType extends LegacyTicketState {
  addComment: (ticketId: string, body: string) => Promise<void>;
  updateComment: (ticketId: string, commentId: string, body: string) => Promise<void>;
  deleteComment: (ticketId: string, commentId: string) => Promise<void>;
  setActiveTicket: Dispatch<SetStateAction<Ticket | null>>;
  addTicketDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  removeTicketDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  addTicketBlocker: (ticketId: string, blockerId: string) => Promise<boolean>;
  removeTicketBlocker: (ticketId: string, blockerId: string) => Promise<boolean>;
  ticketMap: Map<string, Ticket>;
}

export function CompatibilityTicketProvider({ children }: { children: ReactNode }) {
  const { currentUser, loading: authLoading } = useAuth();
  const { users, isLoading: usersLoading } = useUserDirectory();
  const { tickets, ticketMap } = useTicketList();
  const { activeTicket, setActiveTicket } = useActiveTicket();
  const { addComment, updateComment, deleteComment } = useCommentContext();
  const {
    addTicketDependency,
    removeTicketDependency,
    addTicketBlocker,
    removeTicketBlocker,
  } = useTicketRelationsContext();
  const { projectsLoading } = useProjectContext();

  const value = useMemo<TicketContextType>(() => ({
    tickets,
    users,
    activeTicket,
    currentUser,
    loading: authLoading || projectsLoading || usersLoading,
    addComment,
    updateComment,
    deleteComment,
    addTicketDependency,
    removeTicketDependency,
    addTicketBlocker,
    removeTicketBlocker,
    setActiveTicket,
    ticketMap,
  }), [
    addComment,
    addTicketBlocker,
    addTicketDependency,
    activeTicket,
    authLoading,
    currentUser,
    deleteComment,
    projectsLoading,
    removeTicketBlocker,
    removeTicketDependency,
    setActiveTicket,
    ticketMap,
    tickets,
    updateComment,
    users,
    usersLoading,
  ]);

  return <TicketContext.Provider value={value}>{children}</TicketContext.Provider>;
}

export const TicketProvider: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <AuthProvider>
      <AppThemeProvider>
        <SettingsThemeProvider>
          <ActiveProjectProvider>
            <ProjectProvider>
              <ActiveViewProvider>
                <TicketFiltersProvider>
                  <UserDirectoryProvider>
                    <CycleProvider>
                      <LabelProvider>
                        <TicketListProvider>
                          <TicketDetailProvider>
                            <TicketMutationProvider>
                              <CommentProvider>
                                <TicketRelationsProvider>
                                  <RealtimeProvider>
                                    <CompatibilityTicketProvider>
                                      {children}
                                    </CompatibilityTicketProvider>
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
        </SettingsThemeProvider>
      </AppThemeProvider>
    </AuthProvider>
  );
};

export type { User, Project, Domain, Label, Cycle, Ticket, Comment, CreateProjectInput } from '../types/domain';
export type { TicketFiltersState } from './shared';
