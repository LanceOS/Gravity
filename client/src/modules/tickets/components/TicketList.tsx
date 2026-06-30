import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Compass, PlusCircle } from 'lucide-react';
import { Button } from '@library';
import type { Ticket } from '../../../context/TicketContextContext';
import { TicketRowMobile } from './TicketRowMobile/TicketRowMobile';
import { TicketRow } from './TicketRow';
import { TicketContextMenu } from './TicketContextMenu';

import type { TicketListPropsWithPerformance } from '../types/TicketList';
import { getAssigneeAvatar, getPriorityIcon, getStatusLabel, getStatusColor } from '../utils/TicketList';
import { LIST_STATUS_ORDER } from '../utils/ticketView';
import { safeAnime } from '../../../utils/animationUtils';
import anime from 'animejs';

const INITIAL_TICKETS_PER_STATUS = 50;
const LOAD_MORE_STEP = 50;

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
  const showMoreButton = hasMoreRows || false;
  const loadingMoreRows = isLoadingMoreRows || false;
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleByStatus(Object.fromEntries(LIST_STATUS_ORDER.map((status) => [status, INITIAL_TICKETS_PER_STATUS])) as Record<string, number>);
  }, [groupedTickets]);

  useEffect(() => {
    if (!listRef.current) return;
    const rows = listRef.current.querySelectorAll('.ticket-row, .ticket-row-mobile');
    if (rows.length === 0) return;

    // Set initial state before animating
    anime.set(rows, { opacity: 0, translateY: 12 });

    safeAnime({
      targets: rows,
      translateY: [12, 0],
      opacity: [0, 1],
      delay: anime.stagger(25),
      duration: 350,
      easing: 'easeOutQuad',
    });
  }, [groupedTickets, visibleByStatus]);

  const handleLoadMoreStatus = (status: string, totalTicketsForStatus: number) => {
    setVisibleByStatus((previous) => {
      const currentLimit = previous[status] ?? INITIAL_TICKETS_PER_STATUS;
      const nextLimit = Math.min(totalTicketsForStatus, currentLimit + LOAD_MORE_STEP);
      if (nextLimit === currentLimit) {
        return previous;
      }
      return { ...previous, [status]: nextLimit };
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden'
      }}
    >
      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        <>
          {LIST_STATUS_ORDER.map((status) => {
            const ticketsInGroup = groupedTickets[status];
            if (!ticketsInGroup || ticketsInGroup.length === 0) {
              return null;
            }

            const visibleCount = visibleByStatus[status] ?? INITIAL_TICKETS_PER_STATUS;
            const visibleTickets = ticketsInGroup.slice(0, visibleCount);
            const hasMoreInStatus = visibleTickets.length < ticketsInGroup.length;

            return (
              <div key={status} style={{ marginBottom: '24px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--color-text-disabled)',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                    borderBottom: '1px solid var(--color-border-default)',
                    paddingBottom: '4px'
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: getStatusColor(status as Ticket['status']),
                      flexShrink: 0
                    }}
                  />
                  <span>{getStatusLabel(status as Ticket['status'])}</span>
                  <span style={{ background: 'var(--color-border-default)', padding: '1px 5px', borderRadius: '4px', fontSize: '10px' }}>
                    {ticketsInGroup.length}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {visibleTickets.map((ticket) => {
                    const project = projectById?.[ticket.projectId];
                    const rowProps = {
                      ticket,
                      onClick: onSelectTicket,
                      priorityIcon: getPriorityIcon(ticket.priority),
                      assigneeAvatar: getAssigneeAvatar(userAvatarById, ticket.assigneeId),
                      projectName: project?.name,
                      projectColor: undefined as string | undefined,
                    };
                    return (
                      <React.Fragment key={ticket.id}>
                        <div className="ticket-list__row-desktop">
                          <TicketContextMenu ticket={ticket} availableTickets={availableTickets}>
                            <TicketRow {...rowProps} />
                          </TicketContextMenu>
                        </div>
                        <div className="ticket-list__row-mobile">
                          <TicketRowMobile {...rowProps} />
                        </div>
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
                      border: '1px dashed var(--color-border-default)',
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
      </div>
    </div>
  );
});
