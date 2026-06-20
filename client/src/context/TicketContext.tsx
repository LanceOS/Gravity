import React, { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CommentContext, useCommentContextValue } from './comment/CommentContext';
import { useCurrentUser } from './auth/useCurrentUser';
import { TicketRelationsContext, useTicketRelationsContextValue } from './relation/TicketRelationsContext';
import { ProjectContext, useProjectContextValue } from './project/ProjectContext';
import { useActiveProject } from './project/ActiveProjectContext';
import { TicketDetailContext, useTicketDetailContextValue } from './ticket/TicketDetailContext';
import { RealtimeProvider } from './realtime/RealtimeContext';
import { TicketListProvider, useTicketListContext } from './ticket/TicketListContext';
import { useUsersQuery } from '../hooks/useUsers';
import { TicketContext } from './TicketContextContext';

// Shared entity types live in src/types/domain.ts.
export type {
  User,
  Project,
  Domain,
  Label,
  Cycle,
  Ticket,
  Comment,
  CreateProjectInput,
} from '../types/domain';
import type { User, Ticket, Comment } from '../types/domain';

interface State {
  tickets: Ticket[];
  users: User[];
  activeTicket: Ticket | null;
  currentUser: User | null;
  loading: boolean;
}

// TicketFiltersState is imported from ./shared/filters and re-exported below.
export type { TicketFiltersState } from './shared';

export interface TicketContextType extends State {
  addComment: (ticketId: string, body: string) => Promise<void>;
  updateComment: (ticketId: string, commentId: string, body: string) => Promise<void>;
  deleteComment: (ticketId: string, commentId: string) => Promise<void>;
  setActiveTicket: React.Dispatch<React.SetStateAction<Ticket | null>>;
  addTicketDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  removeTicketDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  addTicketBlocker: (ticketId: string, blockerId: string) => Promise<boolean>;
  removeTicketBlocker: (ticketId: string, blockerId: string) => Promise<boolean>;
  ticketMap: Map<string, Ticket>;
}

type TicketProviderContentProps = {
  currentUser: User | null;
  users: User[];
  loading: boolean;
  activeProjectIdRef: React.MutableRefObject<string>;
  children: React.ReactNode;
};

function TicketProviderContent({
  currentUser,
  users,
  loading,
  activeProjectIdRef,
  children,
}: TicketProviderContentProps) {
  const queryClient = useQueryClient();
  const { activeProjectId } = useActiveProject();
  const { tickets, activeTicket, setActiveTicket, ticketMap } = useTicketListContext();

  const ticketDetailContextValue = useTicketDetailContextValue({
    activeTicket,
    setActiveTicket,
    activeProjectId,
    isAuthenticated: !!currentUser,
  });

  const commentContextValue = useCommentContextValue({
    currentUser,
    activeProjectIdRef,
  });

  const {
    activeTicketDetail,
    addTicketDependency,
    removeTicketDependency,
    addTicketBlocker,
    removeTicketBlocker,
  } = useTicketRelationsContextValue({
    queryClient,
    tickets,
    activeTicket,
    activeTicketDetail: ticketDetailContextValue.activeTicketDetail,
  });

  const ticketRelationsContextValue = useMemo(() => ({
    activeTicketDetail,
    addTicketDependency,
    removeTicketDependency,
    addTicketBlocker,
    removeTicketBlocker,
  }), [
    activeTicketDetail,
    addTicketDependency,
    removeTicketDependency,
    addTicketBlocker,
    removeTicketBlocker,
  ]);

  const { addComment, updateComment, deleteComment } = commentContextValue;
  const value = useMemo(
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
    ]
  );

  return (
    <TicketDetailContext.Provider value={ticketDetailContextValue}>
      <CommentContext.Provider value={commentContextValue}>
        <TicketRelationsContext.Provider value={ticketRelationsContextValue}>
          <TicketContext.Provider value={value}>{children}</TicketContext.Provider>
        </TicketRelationsContext.Provider>
      </CommentContext.Provider>
    </TicketDetailContext.Provider>
  );
}

export const TicketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const { setActiveProjectId, activeProjectIdRef } = useActiveProject();
  const { currentUser, loading: authLoading } = useCurrentUser();

  const projectContextValue = useProjectContextValue({
    currentUser,
    setActiveProjectId,
    activeProjectIdRef,
  });

  const { users, loading: usersLoading } = useUsersQuery(!!currentUser);

  const loading = authLoading || projectContextValue.projectsLoading || usersLoading;

  const prevUserIdRef = useRef<string | undefined>(currentUser?.id);
  useEffect(() => {
    if (currentUser?.id !== prevUserIdRef.current) {
      if (prevUserIdRef.current !== undefined && currentUser?.id !== undefined) {
        queryClient.clear();
      }
      prevUserIdRef.current = currentUser?.id;
    }
  }, [currentUser?.id, queryClient]);

  return (
    <ProjectContext.Provider value={projectContextValue}>
      <TicketListProvider currentUser={currentUser}>
        <RealtimeProvider currentUserId={currentUser?.id ?? null}>
          <TicketProviderContent
            currentUser={currentUser}
            users={users}
            loading={loading}
            activeProjectIdRef={activeProjectIdRef}
          >
            {children}
          </TicketProviderContent>
        </RealtimeProvider>
      </TicketListProvider>
    </ProjectContext.Provider>
  );
};
