import React from 'react';
import type { Domain, Ticket } from '../context/TicketContext';
import type { TicketFilters, TicketsByStatus } from '../utils/ticketView';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { 
  ArrowUp, ArrowRight, ArrowDown, ShieldAlert, Minus, Check, 
  GitPullRequest, GitMerge, Paperclip, Compass
} from 'lucide-react';

const PRIORITY_FILTER_OPTIONS = [
  { value: '', label: 'Any Priority' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'no_priority', label: 'No Priority' },
];

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Any Status' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
  { value: 'canceled', label: 'Canceled' },
];

interface TicketListProps {
  filters: TicketFilters;
  filteredCount: number;
  totalCount: number;
  groupedTickets: TicketsByStatus;
  domainById: Record<string, Domain>;
  userAvatarById: Record<string, string>;
  hasActiveFilters: boolean;
  onFilterChange: (filters: Partial<TicketFilters>) => void;
  onClearFilters: () => void;
  onSelectTicket: (ticket: Ticket) => void;
}

export const TicketList: React.FC<TicketListProps> = ({
  filters,
  filteredCount,
  totalCount,
  groupedTickets,
  domainById,
  userAvatarById,
  hasActiveFilters,
  onFilterChange,
  onClearFilters,
  onSelectTicket,
}) => {

  const getPriorityIcon = (priority: Ticket['priority']) => {
    switch (priority) {
      case 'urgent': return <ShieldAlert size={14} className="priority-urgent" />;
      case 'high': return <ArrowUp size={14} className="priority-high" />;
      case 'medium': return <ArrowRight size={14} className="priority-medium" />;
      case 'low': return <ArrowDown size={14} className="priority-low" />;
      default: return <Minus size={14} className="priority-no" />;
    }
  };

  const getStatusLabel = (status: Ticket['status']) => {
    return status.replace('_', ' ').toUpperCase();
  };

  const getAssigneeAvatar = (assigneeId: string | null) => {
    if (!assigneeId) return null;
    return userAvatarById[assigneeId] || null;
  };

  const getDomainTag = (domainId: string | null) => {
    if (!domainId) return null;
    const dom = domainById[domainId];
    return dom ? (
      <span 
        style={{
          fontSize: '11px',
          padding: '2px 6px',
          borderRadius: '4px',
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${dom.color}40`,
          color: dom.color
        }}
      >
        {dom.name}
      </span>
    ) : null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, overflow: 'hidden' }}>
      
      {/* Filtering Header Bar */}
      <div 
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'var(--sidebar-bg)'
        }}
      >
        {/* Search */}
        <input 
          type="text"
          className="input"
          placeholder="Filter tickets by title, body, or ID..."
          value={filters.search}
          onChange={(e) => onFilterChange({ search: e.target.value })}
          style={{ maxWidth: '300px' }}
        />

        {/* Priority Filter */}
        <Select
          value={filters.priority}
          onValueChange={(priority) => onFilterChange({ priority })}
          options={PRIORITY_FILTER_OPTIONS}
          ariaLabel="Filter list by priority"
          style={{ width: '120px' }}
        />

        {/* Status Filter */}
        <Select
          value={filters.status}
          onValueChange={(status) => onFilterChange({ status })}
          options={STATUS_FILTER_OPTIONS}
          ariaLabel="Filter list by status"
          style={{ width: '120px' }}
        />

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button
            onClick={onClearFilters}
            variant="accent"
            size="sm"
          >
            Clear Filters
          </Button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>
          {filteredCount} of {totalCount} tickets
        </div>
      </div>

      {/* Main Rows Scrolling Container */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {Object.entries(groupedTickets).map(([status, ticketsInGroup]) => {
          if (ticketsInGroup.length === 0) return null;
          return (
            <div key={status} style={{ marginBottom: '24px' }}>
              
              {/* Group Title */}
              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  fontSize: '11px', 
                  fontWeight: 600, 
                  color: 'var(--text-muted)', 
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '4px'
                }}
              >
                <span>{getStatusLabel(status as Ticket['status'])}</span>
                <span style={{ background: 'var(--border)', padding: '1px 5px', borderRadius: '4px', fontSize: '10px' }}>
                  {ticketsInGroup.length}
                </span>
              </div>

              {/* Rows List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                {ticketsInGroup.map(ticket => (
                  <TicketRow 
                    key={ticket.id} 
                    ticket={ticket} 
                    onClick={() => onSelectTicket(ticket)}
                    priorityIcon={getPriorityIcon(ticket.priority)}
                    assigneeAvatar={getAssigneeAvatar(ticket.assigneeId)}
                    domainTag={getDomainTag(ticket.domainId)}
                  />
                ))}
              </div>

            </div>
          );
        })}

        {filteredCount === 0 && (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Compass size={48} style={{ strokeWidth: 1, marginBottom: '12px', color: 'var(--border-focus)' }} />
            <div>No tickets match your active filters.</div>
          </div>
        )}
      </div>

    </div>
  );
};

// Sub-component for individual rows to maximize React rendering speed via memoization
interface TicketRowProps {
  ticket: Ticket;
  onClick: () => void;
  priorityIcon: React.ReactNode;
  assigneeAvatar: string | null;
  domainTag: React.ReactNode;
}

const TicketRowImpl: React.FC<TicketRowProps> = ({ 
  ticket, 
  onClick, 
  priorityIcon, 
  assigneeAvatar, 
  domainTag 
}) => {
  return (
    <div 
      onClick={onClick}
      className="clickable"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        background: 'var(--card-bg)',
        transition: 'background 0.15s ease',
        cursor: 'pointer'
      }}
    >
      {/* Priority */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {priorityIcon}
      </div>

      {/* Ticket Key ID (e.g. GRA-12) */}
      <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text-muted)', width: '60px', flexShrink: 0 }}>
        {ticket.key}
      </span>

      {/* Title */}
      <span 
        style={{ 
          fontSize: '13px', 
          fontWeight: 500, 
          color: 'var(--text-heading)', 
          flex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {ticket.title}
      </span>

      {/* Domain Badge */}
      <div style={{ flexShrink: 0 }}>
        {domainTag}
      </div>

      {/* GitHub PR Integration badge */}
      {ticket.prStatus !== 'none' && (
        <a 
          href={ticket.prUrl || '#'} 
          target="_blank" 
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: ticket.prStatus === 'merged' ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)',
            border: `1px solid ${ticket.prStatus === 'merged' ? '#10b98140' : '#3b82f640'}`,
            color: ticket.prStatus === 'merged' ? '#10b981' : '#3b82f6',
            textDecoration: 'none',
            flexShrink: 0
          }}
        >
          {ticket.prStatus === 'merged' ? <GitMerge size={12} /> : <GitPullRequest size={12} />}
          <span>PR {ticket.prStatus.toUpperCase()}</span>
        </a>
      )}

      {/* Sub-ticket Indicators */}
      {ticket.parentId && (
        <span 
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '2px', 
            fontSize: '11px', 
            color: 'var(--text-muted)',
            background: 'var(--sidebar-bg)',
            padding: '2px 6px',
            borderRadius: '4px',
            flexShrink: 0
          }}
        >
          <Paperclip size={10} />
          <span>Sub</span>
        </span>
      )}

      {/* Assignee Avatar */}
      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
        {assigneeAvatar ? (
          <img src={assigneeAvatar} alt="" style={{ width: '100%', height: '100%' }} />
        ) : (
          <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 500 }}>--</span>
        )}
      </div>

      {/* Date */}
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '70px', textAlign: 'right', flexShrink: 0 }}>
        {new Date(ticket.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </span>
    </div>
  );
};

// Wrap with React.memo to ensure list elements do not re-render unnecessarily!
const TicketRow = React.memo(TicketRowImpl);
