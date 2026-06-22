import { createContext, useContext, useEffect, useMemo, useRef, useState, type FC, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../utils/apiClient';
import { CACHE_CONFIGS, queryKeys } from '../../utils/queryClient';
import { hasEquivalentTicketFields } from '../shared';
import { useAuth } from '../auth/AuthContext';
import { useActiveProject } from '../project/ActiveProjectContext';
import { useTicketList } from './TicketListContext';
import { ActiveTicketContext } from './ActiveTicketContext';
import type { Comment, Ticket } from '../../types/domain';
import type { TicketWithRelations } from '../../modules/tickets/utils/ticketRelations';
import type { TicketDetailContextType, TicketDetailContextValueArgs } from './TicketDetailContext.types';

export const TicketDetailContext = createContext<TicketDetailContextType | undefined>(undefined);

export function useTicketDetailContext(): TicketDetailContextType {
  const context = useContext(TicketDetailContext);
  if (!context) {
    throw new Error('useTicketDetailContext must be used within a TicketDetailContext provider');
  }

  return context;
}

export function useTicketDetailContextValue({
  activeTicket,
  setActiveTicket,
  currentUserId,
  activeProjectId,
  tickets,
  isAuthenticated,
}: TicketDetailContextValueArgs): TicketDetailContextType {
  const activeTicketId = activeTicket?.id;
  const activeTicketProjectId = activeTicket?.projectId || activeProjectId;
  const previousActiveTicketDetailRef = useRef<TicketWithRelations | null>(null);
  const previousCommentsRef = useRef<Comment[] | undefined>(undefined);
  const previousContextKeyRef = useRef<string | undefined>(undefined);
  const currentContextKey = `${currentUserId ?? 'anonymous'}:${activeProjectId ?? ''}`;

  const ticketById = useMemo(() => {
    const map = new Map<string, Ticket>();
    for (const ticket of tickets) {
      map.set(ticket.id, ticket);
    }
    return map;
  }, [tickets]);

  const activeTicketDetailQuery = useQuery<TicketWithRelations | null>({
    queryKey: queryKeys.ticketDetail(activeTicketId || ''),
    queryFn: () => apiClient.get<TicketWithRelations>(`/tickets/${activeTicketId}`, { projectId: activeTicketProjectId }),
    enabled: !!activeTicketId && !!activeTicketProjectId && isAuthenticated,
    ...CACHE_CONFIGS.ticketDetail,
  });

  useEffect(() => {
    if (activeTicketDetailQuery.data) {
      previousActiveTicketDetailRef.current = activeTicketDetailQuery.data;
      previousContextKeyRef.current = currentContextKey;
    }
  }, [activeTicketDetailQuery.data, currentContextKey]);

  useEffect(() => {
    if (!activeTicketId) {
      previousActiveTicketDetailRef.current = null;
      previousCommentsRef.current = undefined;
      previousContextKeyRef.current = currentContextKey;
    }
  }, [activeTicketId, currentContextKey]);

  const commentsQuery = useQuery<Comment[]>({
    queryKey: queryKeys.comments(activeTicketId || ''),
    queryFn: () => apiClient.get<Comment[]>(`/tickets/${activeTicketId}/comments`, { projectId: activeTicketProjectId }),
    enabled: !!activeTicketId && !!activeTicketProjectId && isAuthenticated,
    ...CACHE_CONFIGS.ticketDetail,
  });

  useEffect(() => {
    if (Array.isArray(commentsQuery.data)) {
      previousCommentsRef.current = commentsQuery.data;
      previousContextKeyRef.current = currentContextKey;
    }
  }, [commentsQuery.data, currentContextKey]);

  useEffect(() => {
    if (!isAuthenticated || !currentUserId || !activeProjectId || !activeTicketId) {
      previousActiveTicketDetailRef.current = null;
      previousCommentsRef.current = undefined;
      previousContextKeyRef.current = currentContextKey;
      return;
    }

    if ((activeTicketDetailQuery.isError || commentsQuery.isError) && previousContextKeyRef.current !== currentContextKey) {
      previousActiveTicketDetailRef.current = null;
      previousCommentsRef.current = undefined;
      previousContextKeyRef.current = currentContextKey;
    }
  }, [
    activeProjectId,
    activeTicketDetailQuery.isError,
    activeTicketId,
    commentsQuery.isError,
    currentContextKey,
    isAuthenticated,
  ]);

  const activeTicketDetail = activeTicketId
    ? activeTicketDetailQuery.data ?? previousActiveTicketDetailRef.current ?? null
    : null;
  const comments = activeTicketId
    ? commentsQuery.data ?? previousCommentsRef.current ?? []
    : [];

  useEffect(() => {
    if (!activeTicket) {
      return;
    }

    const latest = ticketById.get(activeTicket.id);
    if (latest && !hasEquivalentTicketFields(latest, activeTicket)) {
      setActiveTicket(latest);
    }
  }, [activeTicket, setActiveTicket, ticketById]);

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
  const { currentUser } = useAuth();
  const { activeProjectId } = useActiveProject();
  const { tickets } = useTicketList();
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);

  const value = useTicketDetailContextValue({
    activeTicket,
    setActiveTicket,
    currentUserId: currentUser?.id,
    activeProjectId,
    tickets,
    isAuthenticated: !!currentUser,
  });

  const activeTicketContextValue = useMemo(
    () => ({
      activeTicket,
      setActiveTicket,
    }),
    [activeTicket, setActiveTicket]
  );

  return (
    <ActiveTicketContext.Provider value={activeTicketContextValue}>
      <TicketDetailContext.Provider value={value}>{children}</TicketDetailContext.Provider>
    </ActiveTicketContext.Provider>
  );
};
