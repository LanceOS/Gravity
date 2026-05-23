import type { DragEvent } from 'react';
import type { Ticket } from '../../context/TicketContext';
import { BOARD_COLUMNS } from '../../utils/ticketView';
import { Button, KanbanBoard, Flex } from '@library';
import { Plus } from 'lucide-react';
import { TicketCard } from './components';
import { TicketFilterBar } from '../TicketFilterBar';
import type { TicketBoardProps } from './types';
import { getAssigneeAvatar, getDomainMeta, getPriorityColor, getPriorityIcon } from './utils';

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
      <TicketFilterBar
        filters={filters as any}
        onFilterChange={onFilterChange}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={onClearFilters}
        filteredCount={filteredCount}
        totalCount={totalCount}
      />

      {projects.length > 0 && (
        <Flex
          align="center"
          gap="8px"
          style={{
            padding: '0 16px 16px 16px',
            background: 'var(--bg)',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
            Project
          </span>
          <select
            aria-label="Filter board by project"
            value={((filters as any).projectId as string | undefined) ?? ''}
            onChange={(event) => onFilterChange({ projectId: event.target.value || undefined })}
            style={{
              minWidth: '180px',
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </Flex>
      )}

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
