import type { DragEvent } from 'react';
import type { Ticket } from '../../context/TicketContext';
import { BOARD_COLUMNS } from '../../utils/ticketView';
import { Button, Select, DenseTextInput } from '@library';
import { Plus } from 'lucide-react';
import { TicketCard } from './components';
import type { TicketBoardProps } from './types';
import { getAssigneeAvatar, getBoardProjectOptions, getDomainMeta, getPriorityColor, getPriorityIcon, PRIORITY_FILTER_OPTIONS } from './utils';

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
  const projectOptions = getBoardProjectOptions(projects);

  const handleDragStart = (event: DragEvent, ticketId: string) => {
    event.dataTransfer.setData('text/plain', ticketId);
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = async (event: DragEvent, targetStatus: Ticket['status']) => {
    event.preventDefault();
    const ticketId = event.dataTransfer.getData('text/plain');
    if (ticketId) {
      onMoveTicket(ticketId, { status: targetStatus });
    }
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
        <DenseTextInput 
          placeholder="Search board tickets..."
          value={filters.search}
          onChange={(e) => onFilterChange({ search: e.target.value })}
          style={{ maxWidth: '300px' }}
        />

        {/* Priority Filter */}
        <Select
          value={filters.priority}
          onValueChange={(priority: string) => onFilterChange({ priority: priority as Ticket['priority'] | '' })}
          options={PRIORITY_FILTER_OPTIONS}
          aria-label="Filter board by priority"
          style={{ width: '120px' }}
        />

        {/* Project Selector Filter */}
        <Select
          value={filters.projectId}
          onValueChange={(projectId: string) => onFilterChange({ projectId })}
          options={projectOptions}
          aria-label="Filter board by project"
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
                {colTickets.map((ticket) => {
                  const domainMeta = getDomainMeta(domainById, ticket.domainId);

                  return (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    onClick={() => onSelectTicket(ticket)}
                    onDragStart={(e) => handleDragStart(e, ticket.id)}
                    priorityIcon={getPriorityIcon(ticket.priority)}
                    priorityColor={getPriorityColor(ticket.priority)}
                    domainColor={domainMeta.color}
                    domainName={domainMeta.name}
                    assigneeAvatar={getAssigneeAvatar(userAvatarById, ticket.assigneeId)}
                  />
                  );
                })}

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
