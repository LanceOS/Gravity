import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, PlusCircle } from 'lucide-react';
import { Button, DenseVirtualList } from '@library';
import type { Ticket } from '../../../context/TicketContextContext';
import { TicketRowMobile } from './TicketRowMobile/TicketRowMobile';
import { TicketRow } from './TicketRow';
import { TicketContextMenu } from './TicketContextMenu';
import { useIsMobileTicketLayout } from './useMobileTicketLayout';
import { profileComputation } from '../../../utils/performanceProfile';

import type { TicketListPropsWithPerformance } from '../types/TicketList';
import { getAssigneeAvatar, getStatusLabel, getStatusColor } from '../utils/TicketList';
import { LIST_STATUS_ORDER } from '../utils/ticketView';
import { safeAnime, prefersReducedMotion } from '../../../utils/animationUtils';
import anime from 'animejs';
import './TicketList.css';

type TicketListItem =
  | {
      kind: 'status-header';
      id: string;
      status: Ticket['status'];
      count: number;
    }
  | {
      kind: 'ticket';
      id: string;
      ticket: Ticket;
      projectName?: string;
      assigneeAvatar: string | null;
    }
  | {
      kind: 'status-load-more';
      id: string;
      status: Ticket['status'];
      remaining: number;
    }
  | {
      kind: 'global-load-more';
      id: string;
    }
  | {
      kind: 'empty-state';
      id: string;
    };

const INITIAL_TICKETS_PER_STATUS = 50;
const LOAD_MORE_STEP = 50;
const MAX_TICKETS_FOR_LIST_ANIMATION = 240;
const VIRTUAL_LIST_THRESHOLD = 120;
const LIST_DEFAULT_VIRTUAL_HEIGHT = 560;
const STATUS_HEADER_ROW_HEIGHT = 34;
const TICKET_ROW_GAP_REM = 0.5;
const TICKET_ROW_GAP = `${TICKET_ROW_GAP_REM}rem`;
const DESKTOP_TICKET_ROW_HEIGHT = 44;
const MOBILE_TICKET_ROW_HEIGHT = 76;
const STATUS_LOAD_MORE_ROW_HEIGHT = 44;
const GLOBAL_LOAD_MORE_ROW_HEIGHT = 50;
const EMPTY_STATE_ROW_HEIGHT = 180;
const STATUS_META = {
  backlog: {
    label: getStatusLabel('backlog'),
    color: getStatusColor('backlog'),
  },
  todo: {
    label: getStatusLabel('todo'),
    color: getStatusColor('todo'),
  },
  in_progress: {
    label: getStatusLabel('in_progress'),
    color: getStatusColor('in_progress'),
  },
  in_review: {
    label: getStatusLabel('in_review'),
    color: getStatusColor('in_review'),
  },
  done: {
    label: getStatusLabel('done'),
    color: getStatusColor('done'),
  },
  canceled: {
    label: getStatusLabel('canceled'),
    color: getStatusColor('canceled'),
  },
} as const;

export const TicketList = React.memo(({
  filteredCount,
  groupedTickets,
  availableTickets,
  userAvatarById,
  projectById,
  onSelectTicket,
  onLoadMore,
  hasMoreRows,
  isLoadingMoreRows,
}: TicketListPropsWithPerformance) => {
  const [visibleByStatus, setVisibleByStatus] = useState<Record<string, number>>(() =>
    Object.fromEntries(LIST_STATUS_ORDER.map((status) => [status, INITIAL_TICKETS_PER_STATUS])) as Record<string, number>
  );
  const baseVisibleByStatus = useMemo(() => Object.fromEntries(LIST_STATUS_ORDER.map((status) => [status, INITIAL_TICKETS_PER_STATUS])) as Record<string, number>, []);
  const showMoreButton = hasMoreRows || false;
  const loadingMoreRows = isLoadingMoreRows || false;
  const listRef = useRef<HTMLDivElement>(null);
  const didRunListLoadAnimationRef = React.useRef(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [ticketRowGapPx, setTicketRowGapPx] = useState(13 * TICKET_ROW_GAP_REM);
  const isMobileTicketLayout = useIsMobileTicketLayout();
  const previousFilteredCountRef = useRef(filteredCount);

  const shouldAnimateListLoad = (visibleCount: number) => (
    visibleCount > 0 &&
    visibleCount <= MAX_TICKETS_FOR_LIST_ANIMATION &&
    !prefersReducedMotion()
  );

  const { listItems, visibleTicketCount } = useMemo(() => profileComputation('TicketList:buildItems', () => {
    const items: TicketListItem[] = [];
    let visibleTicketCount = 0;

    LIST_STATUS_ORDER.forEach((status) => {
      const ticketsInGroup = groupedTickets[status] || [];
      if (!ticketsInGroup || ticketsInGroup.length === 0) {
        return;
      }

      const statusVisibleCount = visibleByStatus[status] ?? INITIAL_TICKETS_PER_STATUS;
      const visibleTickets = ticketsInGroup.slice(0, statusVisibleCount);
      const hasMoreInStatus = visibleTickets.length < ticketsInGroup.length;

      items.push({
        kind: 'status-header',
        id: `status-header:${status}`,
        status: status as Ticket['status'],
        count: ticketsInGroup.length,
      });

      visibleTickets.forEach((ticket) => {
        const project = projectById?.[ticket.projectId];

        items.push({
          kind: 'ticket',
          id: `ticket-row:${ticket.id}`,
          ticket,
          projectName: project?.name,
          assigneeAvatar: getAssigneeAvatar(userAvatarById, ticket.assigneeId),
        });
      });
      visibleTicketCount += visibleTickets.length;

      if (hasMoreInStatus) {
        items.push({
          kind: 'status-load-more',
          id: `status-load-more:${status}`,
          status: status as Ticket['status'],
          remaining: Math.max(0, ticketsInGroup.length - statusVisibleCount),
        });
      }
    });

    if (showMoreButton) {
      items.push({
        kind: 'global-load-more',
        id: 'global-load-more',
      });
    }

    if (filteredCount === 0) {
      items.push({
        kind: 'empty-state',
        id: 'no-tickets',
      });
    }

    return {
      listItems: items,
      visibleTicketCount,
    };
  }), [filteredCount, groupedTickets, projectById, showMoreButton, userAvatarById, visibleByStatus]);

  useEffect(() => {
    const listElement = listRef.current;
    if (!listElement) {
      return;
    }

    const updateHeight = () => {
      setViewportHeight(listElement.clientHeight);
      const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 13;
      setTicketRowGapPx(rootFontSize * TICKET_ROW_GAP_REM);
    };

    updateHeight();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(listElement);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    setVisibleByStatus((previous) => {
      const shouldResetToBase = filteredCount < previousFilteredCountRef.current;
      previousFilteredCountRef.current = filteredCount;

      if (shouldResetToBase) {
        return baseVisibleByStatus;
      }
      return previous;
    });
  }, [filteredCount, baseVisibleByStatus]);

  useEffect(() => {
    if (visibleTicketCount === 0) {
      didRunListLoadAnimationRef.current = false;
      return;
    }

    if (visibleTicketCount > MAX_TICKETS_FOR_LIST_ANIMATION) {
      didRunListLoadAnimationRef.current = false;
      return;
    }

    if (didRunListLoadAnimationRef.current) {
      return;
    }

    if (!shouldAnimateListLoad(visibleTicketCount)) {
      return;
    }

    if (!listRef.current) return;

    if (prefersReducedMotion()) {
      anime.set(listRef.current, { opacity: 1, translateY: 0 });
      return;
    }

    // Set initial state before animating
    anime.set(listRef.current, { opacity: 0, translateY: 12 });

    safeAnime({
      targets: listRef.current,
      translateY: [12, 0],
      opacity: [0, 1],
      duration: 350,
      easing: 'easeOutQuad',
    });
    didRunListLoadAnimationRef.current = true;
  }, [isMobileTicketLayout, visibleTicketCount]);

  const handleLoadMoreStatus = useCallback((status: string, totalTicketsForStatus: number) => {
    setVisibleByStatus((previous) => {
      const currentLimit = previous[status] ?? INITIAL_TICKETS_PER_STATUS;
      const nextLimit = Math.min(totalTicketsForStatus, currentLimit + LOAD_MORE_STEP);
      if (nextLimit === currentLimit) {
        return previous;
      }
      return { ...previous, [status]: nextLimit };
    });
  }, []);

  const rowHeight = useCallback((item: TicketListItem): number => {
    if (item.kind === 'status-header') {
      return STATUS_HEADER_ROW_HEIGHT;
    }

    if (item.kind === 'status-load-more' || item.kind === 'global-load-more') {
      return item.kind === 'global-load-more' ? GLOBAL_LOAD_MORE_ROW_HEIGHT : STATUS_LOAD_MORE_ROW_HEIGHT;
    }

    if (item.kind === 'empty-state') {
      return EMPTY_STATE_ROW_HEIGHT;
    }

    return (isMobileTicketLayout ? MOBILE_TICKET_ROW_HEIGHT : DESKTOP_TICKET_ROW_HEIGHT) + ticketRowGapPx;
  }, [isMobileTicketLayout, ticketRowGapPx]);

  const renderVirtualRow = useCallback((item: TicketListItem, _index: number, style: React.CSSProperties) => {
    if (item.kind === 'status-header') {
      const statusMeta = STATUS_META[item.status];

      return (
        <div
          key={item.id}
          style={{
            ...style,
            boxSizing: 'border-box',
            paddingRight: '2px',
          }}
        >
          <div className="ticket-list__status-header">
            <span
              aria-hidden="true"
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: statusMeta.color,
                flexShrink: 0,
              }}
            />
            <span>{statusMeta.label}</span>
            <span className="ticket-list__status-count">
              {item.count}
            </span>
          </div>
        </div>
      );
    }

    if (item.kind === 'ticket') {
      const rowProps = {
        ticket: item.ticket,
        onClick: onSelectTicket,
        priority: item.ticket.priority,
        assigneeAvatar: item.assigneeAvatar,
        projectName: item.projectName,
      };

      return (
        <div
          key={item.id}
          className="ticket-list__virtual-row"
          style={{
            ...style,
            display: 'flex',
            flexDirection: 'column',
            paddingBottom: TICKET_ROW_GAP,
            boxSizing: 'border-box',
          }}
        >
          {isMobileTicketLayout ? (
            <div className="ticket-list__row-mobile">
              <TicketRowMobile {...rowProps} />
            </div>
          ) : (
            <div className="ticket-list__row-desktop">
              <TicketContextMenu ticket={item.ticket} availableTickets={availableTickets}>
                <TicketRow {...rowProps} />
              </TicketContextMenu>
            </div>
          )}
        </div>
      );
    }

    if (item.kind === 'status-load-more') {
      const visibleCount = visibleByStatus[item.status] ?? INITIAL_TICKETS_PER_STATUS;
      const ticketsInGroup = groupedTickets[item.status] || [];

      return (
        <div
          key={item.id}
          style={{
            ...style,
            boxSizing: 'border-box',
            paddingTop: '2px',
            paddingBottom: '8px',
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleLoadMoreStatus(item.status, ticketsInGroup.length)}
            disabled={loadingMoreRows}
            style={{
              color: 'var(--color-text-disabled)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--surface-glass-subtle)',
            }}
          >
            <PlusCircle size={12} style={{ marginRight: '4px' }} />
            {loadingMoreRows ? 'Loading…' : `Load more ${Math.max(0, ticketsInGroup.length - visibleCount)} remaining`}
          </Button>
        </div>
      );
    }

    if (item.kind === 'global-load-more') {
      return (
        <div
          key={item.id}
          style={{
            ...style,
            boxSizing: 'border-box',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            paddingTop: '16px',
          }}
        >
          <Button
            variant="primary"
            onClick={onLoadMore}
            disabled={!onLoadMore || loadingMoreRows}
          >
            {loadingMoreRows ? 'Loading more tickets…' : 'Load more tickets'}
          </Button>
        </div>
      );
    }

    return (
      <div
        key={item.id}
        style={{
          ...style,
          padding: '24px 0',
          textAlign: 'center',
          color: 'var(--color-text-disabled)',
          boxSizing: 'border-box',
        }}
      >
        <Compass size={48} style={{ strokeWidth: 1, marginBottom: '12px', color: 'var(--color-border-focus)' }} />
        <div>No tickets match your active filters.</div>
      </div>
    );
  }, [availableTickets, groupedTickets, handleLoadMoreStatus, isMobileTicketLayout, loadingMoreRows, onLoadMore, onSelectTicket, visibleByStatus]);

  const shouldUseVirtualList = visibleTicketCount >= VIRTUAL_LIST_THRESHOLD;

  return (
    <div
      ref={listRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: shouldUseVirtualList ? 0 : '0',
        }}
      >
        {shouldUseVirtualList ? (
          <DenseVirtualList
            items={listItems}
            height={Math.max(viewportHeight, LIST_DEFAULT_VIRTUAL_HEIGHT)}
            rowHeight={rowHeight}
            renderRow={renderVirtualRow}
            containerStyle={{
              border: 'none',
              borderRadius: '0',
              backgroundColor: 'transparent',
            }}
          />
        ) : (
          <>
            {LIST_STATUS_ORDER.map((status) => {
              const ticketsInGroup = groupedTickets[status];
              if (!ticketsInGroup || ticketsInGroup.length === 0) {
                return null;
              }

              const visibleCount = visibleByStatus[status] ?? INITIAL_TICKETS_PER_STATUS;
              const visibleTickets = ticketsInGroup.slice(0, visibleCount);
              const hasMoreInStatus = visibleTickets.length < ticketsInGroup.length;
              const statusMeta = STATUS_META[status as keyof typeof STATUS_META];

              return (
                <div key={status} style={{ marginBottom: '24px' }}>
                  <div className="ticket-list__status-header">
                    <span
                      aria-hidden="true"
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: statusMeta.color,
                        flexShrink: 0,
                      }}
                    />
                    <span>{statusMeta.label}</span>
                    <span className="ticket-list__status-count">
                      {ticketsInGroup.length}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: TICKET_ROW_GAP }}>
                    {visibleTickets.map((ticket) => {
                      const project = projectById?.[ticket.projectId];
                      const rowProps = {
                        ticket,
                        onClick: onSelectTicket,
                        priority: ticket.priority,
                        assigneeAvatar: getAssigneeAvatar(userAvatarById, ticket.assigneeId),
                        projectName: project?.name,
                      };
                      return (
                        <React.Fragment key={ticket.id}>
                          {isMobileTicketLayout ? (
                            <div className="ticket-list__row-mobile">
                              <TicketRowMobile {...rowProps} />
                            </div>
                          ) : (
                            <div className="ticket-list__row-desktop">
                              <TicketContextMenu ticket={ticket} availableTickets={availableTickets}>
                                <TicketRow {...rowProps} />
                              </TicketContextMenu>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {hasMoreInStatus ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleLoadMoreStatus(status, ticketsInGroup.length)}
                      disabled={loadingMoreRows}
                      style={{
                        marginTop: '8px',
                        color: 'var(--color-text-disabled)',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--surface-glass-subtle)',
                      }}
                    >
                      <PlusCircle size={12} style={{ marginRight: '4px' }} />
                      {loadingMoreRows ? 'Loading…' : `Load more ${Math.max(0, ticketsInGroup.length - visibleCount)} remaining`}
                    </Button>
                  ) : null}
                </div>
              );
            })}

            {showMoreButton ? (
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="primary"
                  onClick={onLoadMore}
                  disabled={!onLoadMore || loadingMoreRows}
                >
                  {loadingMoreRows ? 'Loading more tickets…' : 'Load more tickets'}
                </Button>
              </div>
            ) : null}

            {filteredCount === 0 && (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-disabled)' }}>
                <Compass size={48} style={{ strokeWidth: 1, marginBottom: '12px', color: 'var(--color-border-focus)' }} />
                <div>No tickets match your active filters.</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
