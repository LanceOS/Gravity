import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, Paperclip, Ticket as TicketIcon, X } from 'lucide-react';
import { Popover, Select } from '@library';
import type { Project, Ticket } from '../../../context/TicketContextContext';
import type { SidebarTeam } from '../../../types/domain';
import { apiClient } from '../../../utils/apiClient';
import { CACHE_CONFIGS } from '../../../utils/queryClient';
import type { TicketAttachmentScopeMode } from '../types/AgentChat';
import './TicketContextAttachmentBar.css';

interface TicketContextAttachmentBarProps {
  scopeMode: TicketAttachmentScopeMode;
  projects: Project[];
  teams: SidebarTeam[];
  selectedScopeId: string;
  onScopeChange: (scopeId: string) => void;
  attachedTickets: Ticket[];
  onAttachedTicketsChange: (tickets: Ticket[]) => void;
}

interface AttachmentScopeOption {
  id: string;
  label: string;
  helper?: string;
}

function buildScopeOptions(scopeMode: TicketAttachmentScopeMode, projects: Project[], teams: SidebarTeam[]): AttachmentScopeOption[] {
  if (scopeMode === 'team') {
    return teams.map((team) => ({
      id: team.id,
      label: team.name,
      helper: `${team.projects.length} project${team.projects.length === 1 ? '' : 's'}`,
    }));
  }

  return projects.map((project) => ({
    id: project.id,
    label: project.name,
    helper: project.key,
  }));
}

function getTicketSearchText(ticket: Ticket) {
  return `${ticket.key} ${ticket.title} ${ticket.status} ${ticket.priority}`.toLowerCase();
}

function stopPointerPropagation(event: React.MouseEvent) {
  event.stopPropagation();
}

export function TicketContextAttachmentBar({
  scopeMode,
  projects,
  teams,
  selectedScopeId,
  onScopeChange,
  attachedTickets,
  onAttachedTicketsChange,
}: TicketContextAttachmentBarProps) {
  const [searchTerm, setSearchTerm] = React.useState('');

  const scopeOptions = React.useMemo(
    () => buildScopeOptions(scopeMode, projects, teams),
    [projects, scopeMode, teams],
  );

  const ticketsQuery = useQuery({
    queryKey: ['ai', 'ticket-attachments', scopeMode, selectedScopeId],
    queryFn: () => apiClient.get<Ticket[]>('/tickets', {
      params: scopeMode === 'team'
        ? { teamId: selectedScopeId }
        : { projectId: selectedScopeId },
    }),
    enabled: !!selectedScopeId,
    staleTime: CACHE_CONFIGS.ticketsList.staleTime,
    gcTime: CACHE_CONFIGS.ticketsList.gcTime,
  });

  const tickets = React.useMemo(
    () => (Array.isArray(ticketsQuery.data) ? ticketsQuery.data : []),
    [ticketsQuery.data],
  );
  const isLoadingTickets = ticketsQuery.isLoading || ticketsQuery.isFetching;
  const ticketsError = ticketsQuery.isError ? 'Unable to load tickets.' : null;

  const selectedTicketIds = React.useMemo(
    () => new Set(attachedTickets.map((ticket) => ticket.id)),
    [attachedTickets],
  );

  const visibleTickets = React.useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();
    if (!normalizedSearchTerm) {
      return tickets;
    }

    return tickets.filter((ticket) => getTicketSearchText(ticket).includes(normalizedSearchTerm));
  }, [searchTerm, tickets]);

  const scopeLabel = scopeMode === 'team' ? 'Team' : 'Project';
  const noScopeLabel = scopeMode === 'team' ? 'No teams available' : 'No projects available';

  const handleScopeChange = (nextScopeId: string) => {
    onScopeChange(nextScopeId);
    setSearchTerm('');
  };

  const scopeSelectOptions = React.useMemo(
    () => scopeOptions.map((option) => ({
      value: option.id,
      label: option.helper ? `${option.label} · ${option.helper}` : option.label,
    })),
    [scopeOptions],
  );

  const toggleTicket = (ticket: Ticket) => {
    if (selectedTicketIds.has(ticket.id)) {
      onAttachedTicketsChange(attachedTickets.filter((attachedTicket) => attachedTicket.id !== ticket.id));
      return;
    }

    onAttachedTicketsChange([...attachedTickets, ticket]);
  };

  const removeTicket = (ticketId: string) => {
    onAttachedTicketsChange(attachedTickets.filter((ticket) => ticket.id !== ticketId));
  };

  if (scopeOptions.length === 0) {
    return (
      <div
        style={{
          minHeight: '30px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: 'var(--color-text-disabled)',
          fontSize: '11px',
        }}
      >
        <Paperclip size={12} aria-hidden="true" />
        <span>{noScopeLabel}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        fontSize: '11px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            minWidth: 0,
            color: 'var(--color-text-secondary)',
          }}
        >
          <TicketIcon size={12} aria-hidden="true" />
          <span id="ai-ticket-attachment-scope-label">{scopeLabel}</span>
          <Select
            aria-label={`Select ${scopeLabel.toLowerCase()} for ticket attachments`}
            value={selectedScopeId}
            options={scopeSelectOptions}
            onValueChange={handleScopeChange}
            className="ai-ticket-attachment-scope-select"
            style={{
              width: '184px',
              flexShrink: 1,
              minWidth: '136px',
            }}
          />
        </div>

        <Popover
          align="right"
          contentClassName="ai-ticket-attachment-popover"
          trigger={
            <button
              type="button"
              aria-label="Attach tickets"
              className="clickable"
              disabled={!selectedScopeId}
              style={{
                height: '28px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                border: '1px solid var(--color-border-default)',
                borderRadius: '8px',
                background: 'var(--color-surface-card)',
                color: 'var(--color-text-primary)',
                padding: '0 9px',
                fontSize: '11px',
                fontWeight: 500,
                cursor: selectedScopeId ? 'pointer' : 'not-allowed',
              }}
            >
              <Paperclip size={12} aria-hidden="true" />
              <span>Tickets</span>
              {attachedTickets.length > 0 ? (
                <span
                  aria-label={`${attachedTickets.length} attached ticket${attachedTickets.length === 1 ? '' : 's'}`}
                  style={{
                    minWidth: '16px',
                    height: '16px',
                    borderRadius: '999px',
                    display: 'inline-grid',
                    placeItems: 'center',
                    background: 'var(--color-primary)',
                    color: 'var(--color-text-on-accent)',
                    fontSize: '10px',
                    lineHeight: 1,
                    padding: '0 4px',
                  }}
                >
                  {attachedTickets.length}
                </span>
              ) : null}
            </button>
          }
        >
          <div
            className="ai-ticket-attachment-popover__content"
            onClick={stopPointerPropagation}
          >
            <div className="ai-ticket-attachment-popover__header">
              <div className="ai-ticket-attachment-popover__title">Attach Tickets</div>
              <div className="ai-ticket-attachment-popover__description">
                Choose tickets to add context to this chat.
              </div>
            </div>

            <input
              type="text"
              aria-label="Attach Tickets"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Type to search tickets..."
              className="ai-ticket-attachment-popover__search"
              autoFocus
            />

            <div
              role="listbox"
              aria-label="Tickets available to attach"
              className="ai-ticket-attachment-popover__list"
            >
              {isLoadingTickets ? (
                <div className="ai-ticket-attachment-popover__state">
                  <Loader2 size={14} aria-hidden="true" />
                  <span>Loading tickets...</span>
                </div>
              ) : ticketsError ? (
                <div className="ai-ticket-attachment-popover__state ai-ticket-attachment-popover__state--error">{ticketsError}</div>
              ) : visibleTickets.length === 0 ? (
                <div className="ai-ticket-attachment-popover__state">No matching tickets</div>
              ) : (
                visibleTickets.map((ticket) => {
                  const isAttached = selectedTicketIds.has(ticket.id);
                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      role="option"
                      aria-selected={isAttached}
                      aria-label={`${isAttached ? 'Detach' : 'Attach'} ${ticket.key}`}
                      onClick={() => toggleTicket(ticket)}
                      className="ai-ticket-attachment-popover__ticket-row clickable"
                      data-selected={isAttached ? 'true' : undefined}
                    >
                      <span className="ai-ticket-attachment-popover__ticket-copy">
                        <span className="ai-ticket-attachment-popover__ticket-key">
                          {ticket.key}
                        </span>
                        <span className="ai-ticket-attachment-popover__ticket-title" title={ticket.title}>
                          {ticket.title}
                        </span>
                      </span>
                      {isAttached ? <Check size={13} className="ai-ticket-attachment-popover__ticket-check" aria-hidden="true" /> : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </Popover>
      </div>

      {attachedTickets.length > 0 ? (
        <div
          aria-label="Attached tickets"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '5px',
          }}
        >
          {attachedTickets.map((ticket) => (
            <span
              key={ticket.id}
              style={{
                height: '24px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                border: '1px solid var(--color-border-default)',
                borderRadius: '999px',
                background: 'var(--color-base100)',
                color: 'var(--color-text-primary)',
                padding: '0 5px 0 8px',
                maxWidth: '100%',
              }}
            >
              <TicketIcon size={11} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{ticket.key}</span>
              <button
                type="button"
                aria-label={`Remove ${ticket.key}`}
                onClick={() => removeTicket(ticket.id)}
                className="clickable"
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '999px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-text-disabled)',
                  display: 'grid',
                  placeItems: 'center',
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
