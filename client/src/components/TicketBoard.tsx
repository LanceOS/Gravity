import React from 'react';
import type { Domain, Project, Ticket } from '../context/TicketContext';
import type { TicketFilters, TicketsByStatus } from '../utils/ticketView';
import { BOARD_COLUMNS } from '../utils/ticketView';
import { 
  ArrowUp, ArrowRight, ArrowDown, ShieldAlert, Minus, 
  GitPullRequest, GitMerge, Paperclip, MoreHorizontal, Plus
} from 'lucide-react';

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
        <select 
          className="input"
          style={{ width: '120px' }}
          value={filters.priority}
          onChange={(e) => onFilterChange({ priority: e.target.value })}
        >
          <option value="">Any Priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="no_priority">No Priority</option>
        </select>

        {/* Project Selector Filter */}
        <select 
          className="input"
          style={{ width: '140px' }}
          value={filters.projectId}
          onChange={(e) => onFilterChange({ projectId: e.target.value })}
        >
          <option value="">Any Project</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <button 
            onClick={onClearFilters}
            className="btn clickable"
            style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--accent)' }}
          >
            Clear Filters
          </button>
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

                <button 
                  onClick={() => onOpenCreateTicket(col.id)}
                  className="clickable"
                  style={{
                    marginLeft: 'auto',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px'
                  }}
                >
                  <Plus size={14} />
                </button>
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
