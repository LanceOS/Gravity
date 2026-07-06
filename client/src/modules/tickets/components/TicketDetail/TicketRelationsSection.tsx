import React, { useCallback, useMemo } from 'react';
import { Link, Plus, Trash2 } from 'lucide-react';
import { Popover } from '@library';
import type { Ticket, User } from '../../../../types/domain';
import { SearchableOptionPickerPopoverContent } from '../SearchableOptionPickerPopoverContent';
import { collectRelatedTicketIds, type TicketRelation } from '../../utils/ticketRelations';

interface TicketRelationsSectionProps {
  activeTicket: Ticket;
  activeTicketDetail: Ticket | null;
  availableTickets: Ticket[];
  ticketsById?: Map<string, Ticket>;
  parentTicket?: Ticket | null;
  users: User[];
  onSelectTicket: (ticket: Ticket | null) => void;
  onAddDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  onRemoveDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  onAddBlocker?: (ticketId: string, blockerId: string) => Promise<boolean>;
  onRemoveBlocker?: (ticketId: string, blockerId: string) => Promise<boolean>;
}

function renderAddRelationTrigger(buttonLabel: string) {
  return (
    <button
      type="button"
      className="ticket-detail__inline-trigger"
    >
      <Plus size={10} />
      <span>{buttonLabel}</span>
    </button>
  );
}

export const TicketRelationsSection: React.FC<TicketRelationsSectionProps> = ({
  activeTicket,
  activeTicketDetail,
  availableTickets,
  ticketsById,
  parentTicket,
  users,
  onSelectTicket,
  onAddDependency,
  onRemoveDependency,
  onAddBlocker,
  onRemoveBlocker,
}) => {
  const dependencyLinks = activeTicketDetail?.dependencies || [];
  const blockerLinks = activeTicketDetail?.blockers || [];
  const canManageBlockers = typeof onAddBlocker === 'function' && typeof onRemoveBlocker === 'function';

  const dependencyTicketIds = useMemo(() => new Set(dependencyLinks.map((dependency) => dependency.id)), [dependencyLinks]);
  const blockerTicketIds = useMemo(() => new Set(blockerLinks.map((blocker) => blocker.id)), [blockerLinks]);
  const relatedTicketIds = useMemo(() => {
    return new Set(collectRelatedTicketIds({
      dependencies: activeTicketDetail?.dependencies,
      blockers: activeTicketDetail?.blockers,
      
    }));
  }, [ activeTicketDetail?.blockers, activeTicketDetail?.dependencies]);
  const isCompatibleRelationCandidate = useCallback((ticketId: string) => {
    return ticketId !== activeTicket.id && !relatedTicketIds.has(ticketId);
  }, [activeTicket.id, relatedTicketIds]);

  const availableTicketsById = useMemo(() => {
    if (ticketsById) {
      return ticketsById;
    }

    const ticketMap = new Map(availableTickets.map((ticket) => [ticket.id, ticket]));
    if (parentTicket) {
      ticketMap.set(parentTicket.id, parentTicket);
    }
    return ticketMap;
  }, [availableTickets, parentTicket, ticketsById]);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const resolveAssignee = useCallback((ticket: Ticket | null) => {
    if (!ticket?.assigneeId) {
      return { name: 'Unassigned', avatar: '' };
    }

    const assignee = usersById.get(ticket.assigneeId);
    return {
      name: assignee?.name || 'Unknown member',
      avatar: assignee?.avatar || '',
    };
  }, [usersById]);

  const configurationEntries = useMemo(() => {
    const entries: Array<{
      id: string;
      relation: string;
      key: string;
      title: string;
      assigneeName: string;
      assigneeAvatar: string;
      resolvedTicket: Ticket | null;
    }> = [];

    const pushEntry = (relation: string, ticket: TicketRelation | null, resolvedTicket: Ticket | null) => {
      if (!ticket) {
        return;
      }

      const assignee = resolveAssignee(resolvedTicket);
      entries.push({
        id: `${relation.toLowerCase().replace(/\s+/g, '-')}-${ticket.id}`,
        relation,
        key: ticket.key,
        title: ticket.title,
        assigneeName: assignee.name,
        assigneeAvatar: assignee.avatar,
        resolvedTicket,
      });
    };

    pushEntry('Sub-ticket of', parentTicket ?? null, parentTicket ?? null);

    blockerLinks.forEach((blocker) => {
      pushEntry('Blocked by', blocker, availableTicketsById.get(blocker.id) || null);
    });

    dependencyLinks.forEach((dependency) => {
      pushEntry('Blocks', dependency, availableTicketsById.get(dependency.id) || null);
    });

    return entries;
  }, [availableTicketsById, blockerLinks, dependencyLinks, parentTicket, resolveAssignee]);

  const ticketOptions = useMemo(() => {
    return availableTickets
      .filter((ticket) => isCompatibleRelationCandidate(ticket.id))
      .map((ticket) => ({
        id: ticket.id,
        label: ticket.key,
        description: ticket.title,
        searchText: [ticket.key, ticket.title].filter(Boolean).join(' '),
      }));
  }, [availableTickets, isCompatibleRelationCandidate]);

  const handleAddDependency = useCallback(async (dependencyId: string) => {
    if (!dependencyId) return;
    await onAddDependency(activeTicket.id, dependencyId);
  }, [activeTicket.id, onAddDependency]);

  const handleRemoveDependency = useCallback(async (dependencyId: string) => {
    if (!dependencyId) return;
    await onRemoveDependency(activeTicket.id, dependencyId);
  }, [activeTicket.id, onRemoveDependency]);

  const handleAddBlocker = useCallback(async (blockerId: string) => {
    if (!onAddBlocker || !blockerId) return;
    await onAddBlocker(activeTicket.id, blockerId);
  }, [activeTicket.id, onAddBlocker]);

  const handleRemoveBlocker = useCallback(async (blockerId: string) => {
    if (!onRemoveBlocker || !blockerId) return;
    await onRemoveBlocker(activeTicket.id, blockerId);
  }, [activeTicket.id, onRemoveBlocker]);

  return (
    <div style={{ borderTop: '1px solid var(--color-border-default)', paddingTop: '16px', marginTop: '8px' }}>
      {configurationEntries.length > 0 ? (
        <section className="ticket-relations" style={{ marginBottom: '16px' }}>
          <div className="ticket-relations__header">
            <span className="ticket-relations__title">Relations</span>

            <span className="ticket-relations__count">
              {configurationEntries.length}
            </span>
          </div>

          <div className="ticket-relations__items">
            {configurationEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="ticket-configurations__line"
                onClick={() => {
                  if (entry.resolvedTicket) {
                    onSelectTicket(entry.resolvedTicket);
                  }
                }}
                disabled={!entry.resolvedTicket}
                aria-label={entry.relation === 'Sub-ticket of' ? `${entry.relation}: ${entry.key} - ${entry.title}` : `${entry.key} - ${entry.title}`}
              >
                <span className="ticket-configurations__relation">{entry.relation}</span>

                <span className="ticket-configurations__ticket-key">{entry.key}</span>

                <span className="ticket-configurations__ticket-title">{entry.title}</span>

                <span className="ticket-configurations__assignee">
                  {entry.assigneeAvatar ? (
                    <img
                      src={entry.assigneeAvatar}
                      alt=""
                      className="ticket-configurations__assignee-avatar"
                    />
                  ) : (
                    <span className="ticket-configurations__assignee-fallback" aria-hidden="true">
                      {entry.assigneeName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="ticket-configurations__assignee-name">{entry.assigneeName}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
        <Link size={12} />
        <span>Dependencies</span>
      </span>

      {dependencyLinks.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
          {dependencyLinks.map((dependency) => {
            const resolvedTicket = availableTicketsById.get(dependency.id) || null;
            const assignee = resolveAssignee(resolvedTicket);

            return (
              <div key={dependency.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-base100)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                <span className="clickable" style={{ color: 'var(--color-primary)', fontWeight: 500, cursor: 'pointer' }} onClick={() => {
                  if (resolvedTicket) {
                    onSelectTicket(resolvedTicket);
                  }
                }}>
                  {dependency.key}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                  {assignee.name ? (
                    <span style={{ fontSize: '11px', color: 'var(--color-text-disabled)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {assignee.name}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => { void handleRemoveDependency(dependency.id); }}
                    style={{ background: 'none', border: 'none', color: 'var(--color-text-disabled)', cursor: 'pointer', display: 'flex', padding: '2px' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--color-error)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-disabled)'}
                    aria-label={`Remove dependency ${dependency.key}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', fontStyle: 'italic', marginBottom: '8px' }}>
          No dependencies
        </div>
      )}

      <Popover
        align="left"
        style={{ display: 'block' }}
        contentClassName="ticket-detail__label-popover"
        trigger={renderAddRelationTrigger('Add Dependency')}
      >
        <SearchableOptionPickerPopoverContent
          title="Search Tickets"
          searchPlaceholder="Type to search tickets..."
          options={ticketOptions}
          selectedIds={dependencyTicketIds}
          onToggle={(id, isSelected) => {
            if (!isSelected) {
              void handleAddDependency(id);
            }
          }}
          emptyStateLabel="No matching tickets"
          showCheckbox={false}
        />
      </Popover>

      <div style={{ marginTop: '16px', borderTop: '1px dashed var(--color-border-default)', paddingTop: '12px' }}>
        <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
          <Link size={12} />
          <span>Blockers</span>
        </span>

        {blockerLinks.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
            {blockerLinks.map((blocker) => {
              const resolvedTicket = availableTicketsById.get(blocker.id) || null;
              const assignee = resolveAssignee(resolvedTicket);

              return (
                <div key={blocker.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-base100)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                  <span className="clickable" style={{ color: 'var(--color-primary)', fontWeight: 500, cursor: 'pointer' }} onClick={() => {
                    if (resolvedTicket) {
                      onSelectTicket(resolvedTicket);
                    }
                  }}>
                    {blocker.key}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    {assignee.name ? (
                      <span style={{ fontSize: '11px', color: 'var(--color-text-disabled)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {assignee.name}
                      </span>
                    ) : null}
                    {canManageBlockers ? (
                      <button
                        type="button"
                        onClick={() => { void handleRemoveBlocker(blocker.id); }}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-disabled)', cursor: 'pointer', display: 'flex', padding: '2px' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--color-error)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-disabled)'}
                        aria-label={`Remove blocker ${blocker.key}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', fontStyle: 'italic', marginBottom: '8px' }}>
            No blockers
          </div>
        )}

        {canManageBlockers ? (
          <Popover
            align="left"
            style={{ display: 'block' }}
            contentClassName="ticket-detail__label-popover"
            trigger={renderAddRelationTrigger('Add Blocker')}
          >
            <SearchableOptionPickerPopoverContent
              title="Search Tickets"
              searchPlaceholder="Type to search tickets..."
              options={ticketOptions}
              selectedIds={blockerTicketIds}
              onToggle={(id, isSelected) => {
                if (!isSelected) {
                  void handleAddBlocker(id);
                }
              }}
              emptyStateLabel="No matching tickets"
              showCheckbox={false}
            />
          </Popover>
        ) : null}
      </div>
    </div>
  );
};
