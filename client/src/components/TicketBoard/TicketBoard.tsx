import type { DragEvent } from 'react';
import type { Ticket } from '../../context/TicketContext';
import { BOARD_COLUMNS } from '../../utils/ticketView';
import { Button, Select, DenseTextInput, KanbanBoard, Flex } from '@library';
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

  const renderColumnHeader = (columnId: string, title: string, count: number) => {
    const col = BOARD_COLUMNS.find((c) => c.id === columnId);
    return (
      <Flex
        align="center"
        gap="8px"
        style={{
          padding: '16px 20px 8px 20px',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: col?.color }} />
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>
          {title}
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
          {count}
        </span>

        <Button
          onClick={() => onOpenCreateTicket(columnId as Ticket['status'])}
          variant="ghost"
          size="sm"
          aria-label={`Create ticket in ${title}`}
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
      </Flex>
    );
  };

  const formattedCards = BOARD_COLUMNS.flatMap((col) => {
    const colTickets = ticketsByColumn[col.id] || [];
    return colTickets.map((ticket) => {
      const domainMeta = getDomainMeta(domainById, ticket.domainId);
      return {
        id: ticket.id,
        status: ticket.status,
        content: (
          <TicketCard
            ticket={ticket}
            onClick={() => onSelectTicket(ticket)}
            onDragStart={(e) => handleDragStart(e, ticket.id)}
            priorityIcon={getPriorityIcon(ticket.priority)}
            priorityColor={getPriorityColor(ticket.priority)}
            domainColor={domainMeta.color}
            domainName={domainMeta.name}
            assigneeAvatar={getAssigneeAvatar(userAvatarById, ticket.assigneeId)}
          />
        ),
      };
    });
  });

  return (
    <Flex direction="column" style={{ height: '100%', flex: 1, overflow: 'hidden' }}>

      {/* Filtering Header Bar */}
      <Flex
        align="center"
        gap="12px"
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--sidebar-bg)'
        }}
      >
        {/* Search */}
        <DenseTextInput
          placeholder="Search board tickets..."
          value={filters.search}
          onChange={(e) => onFilterChange({ search: e.target.value })}
        />

        {/* Priority Filter */}
        <Select
          value={filters.priority}
          onValueChange={(priority: string) => onFilterChange({ priority: priority as Ticket['priority'] | '' })}
          options={PRIORITY_FILTER_OPTIONS}
          aria-label="Filter board by priority"
        />

        {/* Project Selector Filter */}
        <Select
          value={filters.projectId}
          onValueChange={(projectId: string) => onFilterChange({ projectId })}
          options={projectOptions}
          aria-label="Filter board by project"
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
      </Flex>

      {/* Kanban Board Container */}
      <div style={{ flex: 1, overflowY: 'hidden', padding: '16px', background: 'var(--bg)' }}>
        <KanbanBoard
          columns={BOARD_COLUMNS}
          cards={formattedCards}
          onCardMove={(cardId, nextStatus) => onMoveTicket(cardId, { status: nextStatus as Ticket['status'] })}
          renderColumnHeader={renderColumnHeader}
        />
      </div>

    </Flex>
  );
};
