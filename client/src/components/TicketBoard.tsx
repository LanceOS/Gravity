import React from 'react';
import type { Domain, Project, Ticket } from '../context/TicketContext';
import type { TicketFilters, TicketsByStatus } from '../utils/ticketView';
import { BOARD_COLUMNS } from '../utils/ticketView';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { 
  ArrowUp, ArrowRight, ArrowDown, ShieldAlert, Minus, 
  GitPullRequest, GitMerge, Paperclip, MoreHorizontal, Plus
} from 'lucide-react';

const PRIORITY_FILTER_VALUES: Array<[string, string]> = [
  ['', 'Any Priority'],
  ['urgent', 'Urgent'],
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
  ['no_priority', 'No Priority'],
];

const PRIORITY_FILTER_OPTIONS = PRIORITY_FILTER_VALUES.map(([value, label]) => ({
  value,
  label,
}));

interface TicketBoardProps {
  projects: Project[];
  filters: TicketFilters;
  filteredCount: number;
  totalCount: number;
  ticketsByColumn: TicketsByStatus;
  domainById: Record<string, Domain>;
  userAvatarById: Record<string, string>;
  hasActiveFilters: boolean;
  onFilterChange: (filters: Partial<TicketFilters>) => void;
  onClearFilters: () => void;
  onMoveTicket: (ticketId: string, updates: Partial<Ticket>) => Promise<void>;
  onSelectTicket: (ticket: Ticket) => void;
  onOpenCreateTicket: (initialStatus?: Ticket['status']) => void;
}

export const TicketBoard: React.FC<TicketBoardProps> = ({
  projects,
  filters,
  filteredCount,
  totalCount,
  ticketsByColumn,
  domainById,
  userAvatarById,
  hasActiveFilters,
  onFilterChange,
  onClearFilters,
  onMoveTicket,
  onSelectTicket,
  onOpenCreateTicket,
}) => {
  const projectOptions = [{ value: '', label: 'Any Project' }, ...projects.map((project) => ({ value: project.id, label: project.name }))];

  const handleDragStart = (e: React.DragEvent, ticketId: string) => {
    e.dataTransfer.setData('text/plain', ticketId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: Ticket['status']) => {
    e.preventDefault();
    const ticketId = e.dataTransfer.getData('text/plain');
    if (ticketId) {
      onMoveTicket(ticketId, { status: targetStatus });
    }
  };

  const getPriorityIcon = (priority: Ticket['priority']) => {
    switch (priority) {
      case 'urgent': return <ShieldAlert size={12} className="priority-urgent" />;
      case 'high': return <ArrowUp size={12} className="priority-high" />;
      case 'medium': return <ArrowRight size={12} className="priority-medium" />;
      case 'low': return <ArrowDown size={12} className="priority-low" />;
      default: return <Minus size={12} className="priority-no" />;
    }
  };

  const getPriorityColor = (priority: Ticket['priority']) => {
    switch (priority) {
      case 'urgent': return '#ec4899';
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#3b82f6';
      default: return 'transparent';
    }
  };

  const getDomainColor = (domainId: string | null) => {
    if (!domainId) return 'transparent';
    const dom = domainById[domainId];
    return dom ? dom.color : 'transparent';
  };

  const getDomainName = (domainId: string | null) => {
    if (!domainId) return '';
    const dom = domainById[domainId];
    return dom ? dom.name : '';
  };

  const getAssigneeAvatar = (assigneeId: string | null) => {
    if (!assigneeId) return null;
    return userAvatarById[assigneeId] || null;
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
          placeholder="Search board tickets..."
          value={filters.search}
          onChange={(e) => onFilterChange({ search: e.target.value })}
          style={{ maxWidth: '300px' }}
        />

        {/* Priority Filter */}
        <Select
          value={filters.priority}
          onValueChange={(priority) => onFilterChange({ priority })}
          options={PRIORITY_FILTER_OPTIONS}
          ariaLabel="Filter board by priority"
          style={{ width: '120px' }}
        />

        {/* Project Selector Filter */}
        <Select
          value={filters.projectId}
          onValueChange={(projectId) => onFilterChange({ projectId })}
          options={projectOptions}
          ariaLabel="Filter board by project"
          style={{ width: '140px' }}
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
          Showing {filteredCount} of {totalCount} tickets
        </div>
      </div>

      {/* Kanban Board Layout Columns Container */}
      <div 
        style={{ 
          flex: 1, 
          display: 'flex', 
          overflowX: 'auto', 
          overflowY: 'hidden',
          background: 'var(--bg)'
        }}
      >
        {BOARD_COLUMNS.map(col => {
          const colTickets = ticketsByColumn[col.id] || [];
          return (
            <div 
              key={col.id} 
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id)}
              className="board-column"
              style={{
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
                width: '300px',
                borderRight: '1px solid var(--border)',
                height: '100%'
              }}
            >
              {/* Column Header */}
              <div 
                style={{
                  padding: '16px 20px 8px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  position: 'sticky',
                  top: 0
                }}
              >
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: col.color }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>
                  {col.title}
                </span>
                <span 
                  style={{ 
                    fontSize: '10px', 
                    color: 'var(--text-muted)', 
                    background: 'var(--sidebar-bg)', 
                    padding: '1px 6px', 
                    borderRadius: '4px',
                    marginLeft: '4px'
                  }}
                >
                  {colTickets.length}
                </span>

                <Button
                  onClick={() => onOpenCreateTicket(col.id)}
                  variant="ghost"
                  size="sm"
                  aria-label={`Create ticket in ${col.title}`}
                  style={{
                    marginLeft: 'auto',
                    color: 'var(--text-muted)',
                    width: '20px',
                    minHeight: '20px',
                    padding: 0,
                    border: 'none'
                  }}
                >
                  <Plus size={14} />
                </Button>
              </div>

              {/* Cards scrolling list */}
              <div 
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '8px 12px 24px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                {colTickets.map(ticket => (
                  <TicketCard 
                    key={ticket.id} 
                    ticket={ticket} 
                    onClick={() => onSelectTicket(ticket)}
                    onDragStart={(e) => handleDragStart(e, ticket.id)}
                    priorityIcon={getPriorityIcon(ticket.priority)}
                    priorityColor={getPriorityColor(ticket.priority)}
                    domainColor={getDomainColor(ticket.domainId)}
                    domainName={getDomainName(ticket.domainId)}
                    assigneeAvatar={getAssigneeAvatar(ticket.assigneeId)}
                  />
                ))}

                {colTickets.length === 0 && (
                  <div 
                    style={{
                      border: '1px dashed var(--border)',
                      borderRadius: '6px',
                      padding: '24px 12px',
                      textAlign: 'center',
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      opacity: 0.6
                    }}
                  >
                    No tickets
                  </div>
                )}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};

// Sub-component for Kanban Cards to optimize re-renders using React.memo
interface TicketCardProps {
  ticket: Ticket;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  priorityIcon: React.ReactNode;
  priorityColor: string;
  domainColor: string;
  domainName: string;
  assigneeAvatar: string | null;
}

const TicketCardImpl: React.FC<TicketCardProps> = ({
  ticket,
  onClick,
  onDragStart,
  priorityIcon,
  priorityColor,
  domainColor,
  domainName,
  assigneeAvatar
}) => {
  return (
    <div 
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="clickable"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${priorityColor}`,
        borderRadius: '6px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        cursor: 'grab',
        transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
      }}
    >
      
      {/* Key & Icons Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
          {ticket.key}
        </span>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Sub-ticket indicator */}
          {ticket.parentId && <Paperclip size={10} color="var(--text-muted)" />}
          
          {/* PR status */}
          {ticket.prStatus !== 'none' && (
            <div 
              title={`PR ${ticket.prStatus}`}
              style={{
                color: ticket.prStatus === 'merged' ? '#10b981' : '#3b82f6',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {ticket.prStatus === 'merged' ? <GitMerge size={12} /> : <GitPullRequest size={12} />}
            </div>
          )}
        </div>
      </div>

      {/* Ticket Title */}
      <div 
        style={{
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--text-heading)',
          lineHeight: '1.4',
          wordBreak: 'break-word',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}
      >
        {ticket.title}
      </div>

      {/* Footer tags & Assignee */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.01)', paddingTop: '8px', marginTop: '2px' }}>
        
        {/* Priority & Domain Dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {priorityIcon}
          </div>

          {domainColor !== 'transparent' && (
            <div 
              title={domainName}
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: domainColor
              }}
            />
          )}
        </div>

        {/* Assignee Avatar */}
        <div 
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: 'var(--sidebar-bg)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
          }}
        >
          {assigneeAvatar ? (
            <img src={assigneeAvatar} alt="" style={{ width: '100%', height: '100%' }} />
          ) : (
            <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>--</span>
          )}
        </div>

      </div>

    </div>
  );
};

const TicketCard = React.memo(TicketCardImpl);
