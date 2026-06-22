import { createContext, useContext, useEffect, useMemo, useRef, type FC, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../utils/apiClient';
import { CACHE_CONFIGS, queryKeys } from '../../utils/queryClient';
import type { Comment, Ticket } from '../../types/domain';
import type { TicketWithRelations } from '../../modules/tickets/utils/ticketRelations';
import { useAuth } from '../auth/AuthContext';
import { useActiveProject } from '../project/ActiveProjectContext';
import { useActiveTicket } from './ActiveTicketContext';
import type { TicketDetailContextType, TicketDetailContextValueArgs } from './TicketDetailContext.types';

export const TicketDetailContext = createContext<TicketDetailContextType | undefined>(undefined);

export function useOptionalTicketDetailContext(): TicketDetailContextType | undefined {
  return useContext(TicketDetailContext);
}

export function useTicketDetailContext(): TicketDetailContextType {
  const context = useOptionalTicketDetailContext();
  if (!context) {
    throw new Error('useTicketDetailContext must be used within a TicketDetailContext provider');
  }

  return context;
}

export function useTicketDetailContextValue({
  activeTicket,
  setActiveTicket,
  activeProjectId,
  isAuthenticated,
}: TicketDetailContextValueArgs): TicketDetailContextType {
  const activeTicketId = activeTicket?.id;
  const activeTicketProjectId = activeTicket?.projectId || activeProjectId;
  const previousActiveTicketDetailRef = useRef<TicketWithRelations | null>(null);
  const previousCommentsRef = useRef<Comment[] | undefined>(undefined);

  const activeTicketDetailQuery = useQuery<TicketWithRelations | null>({
    queryKey: queryKeys.ticketDetail(activeTicketId || ''),
    queryFn: () => apiClient.get<TicketWithRelations>(`/tickets/${activeTicketId}`, { projectId: activeTicketProjectId }),
    enabled: !!activeTicketId && !!activeTicketProjectId && isAuthenticated,
    ...CACHE_CONFIGS.ticketDetail,
  });

  useEffect(() => {
    if (activeTicketDetailQuery.data) {
      previousActiveTicketDetailRef.current = activeTicketDetailQuery.data;
    }
  }, [activeTicketDetailQuery.data]);

  useEffect(() => {
    if (!activeTicketId) {
      previousActiveTicketDetailRef.current = null;
      previousCommentsRef.current = undefined;
    }
  }, [activeTicketId]);

  const commentsQuery = useQuery<Comment[]>({
    queryKey: queryKeys.comments(activeTicketId || ''),
    queryFn: () => apiClient.get<Comment[]>(`/tickets/${activeTicketId}/comments`, { projectId: activeTicketProjectId }),
    enabled: !!activeTicketId && !!activeTicketProjectId && isAuthenticated,
    ...CACHE_CONFIGS.ticketDetail,
  });

  useEffect(() => {
    if (Array.isArray(commentsQuery.data)) {
      previousCommentsRef.current = commentsQuery.data;
    }
  }, [commentsQuery.data]);

  const activeTicketDetail = activeTicketId
    ? activeTicketDetailQuery.data ?? previousActiveTicketDetailRef.current ?? null
    : null;
  const comments = activeTicketId
    ? commentsQuery.data ?? previousCommentsRef.current ?? []
    : [];

  return useMemo(() => ({
    activeTicket,
    setActiveTicket,
    activeTicketId,
    activeTicketProjectId,
    comments,
    activeTicketDetail,
  }), [
    activeTicket,
    activeTicketDetail,
    activeTicketId,
    activeTicketProjectId,
    comments,
    setActiveTicket,
  ]);
}

export const TicketDetailProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { activeTicket, setActiveTicket } = useActiveTicket();
  const { activeProjectId } = useActiveProject();
  const { isAuthenticated } = useAuth();

  const value = useTicketDetailContextValue({
    activeTicket,
    setActiveTicket,
    activeProjectId,
    isAuthenticated,
  });

  return (
    <TicketDetailContext.Provider value={value}>
      {children}
    </TicketDetailContext.Provider>
  );
};
