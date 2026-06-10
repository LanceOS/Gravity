import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@library';
import { TicketDetail } from './TicketDetail/TicketDetail';
import type { Ticket, Comment, User, Project, Label, Cycle } from '../../../context/TicketContext';

interface TicketDetailRouteProps {
  activeWorkspaceId: string;
  activeTicket: Ticket | null;
  comments: Comment[];
  tickets: Ticket[];
  users: User[];
  projects: Project[];
  labels: Label[];
  cycles: Cycle[];
  onSelectTicket: (ticket: Ticket | null) => void;
  onUpdateTicket: (id: string, updates: Partial<Ticket>) => Promise<void>;
  onDeleteTicket: (ticketId: string) => Promise<void>;
  onAddComment: (ticketId: string, body: string) => Promise<void>;
  onUpdateComment: (ticketId: string, commentId: string, body: string) => Promise<void>;
  onDeleteComment: (ticketId: string, commentId: string) => Promise<void>;
  onOpenCreateSubtask: (parentId: string) => void;
}

export const TicketDetailRoute: React.FC<TicketDetailRouteProps> = ({
  activeWorkspaceId,
  activeTicket,
  comments,
  tickets,
  users,
  projects,
  labels,
  cycles,
  onSelectTicket,
  onUpdateTicket,
  onDeleteTicket,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onOpenCreateSubtask,
}) => {
  const navigate = useNavigate();
  const { workspaceId, projectId, ticketKey } = useParams();

  const detailSubtasks = useMemo(
    () => (activeTicket ? tickets.filter((ticket) => ticket.parentId === activeTicket.id) : []),
    [tickets, activeTicket]
  );

  const parentTicket = useMemo(
    () => (activeTicket ? tickets.find((t) => t.id === activeTicket.parentId) || null : null),
    [tickets, activeTicket]
  );

  const completedDetailSubtasks = useMemo(
    () => detailSubtasks.filter((ticket) => ticket.status === 'done' || ticket.status === 'canceled').length,
    [detailSubtasks]
  );

  const detailSubtaskProgressPercent = useMemo(
    () => (detailSubtasks.length > 0 ? (completedDetailSubtasks / detailSubtasks.length) * 100 : 0),
    [detailSubtasks, completedDetailSubtasks]
  );

  if (!activeTicket) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        <h2>Ticket Not Found</h2>
        <p style={{ marginTop: '8px', marginBottom: '24px' }}>The ticket {ticketKey} could not be found or you do not have permission to view it.</p>
        <Button
          onClick={() => navigate(`/workspaces/${workspaceId}/projects/${projectId}/tickets`)}
          variant="primary"
        >
          Back to Tickets
        </Button>
      </div>
    );
  }

  // Determine the correct route-based URL for copying the link
  const ticketLink = `${window.location.origin}/workspaces/${activeWorkspaceId}/projects/${activeTicket.projectId}/tickets/${activeTicket.key}`;

  return (
    <>
      <TicketDetail
        activeTicket={activeTicket}
        comments={comments}
        subtasks={detailSubtasks}
        completedSubtasks={completedDetailSubtasks}
        subtaskProgressPercent={detailSubtaskProgressPercent}
        parentTicket={parentTicket}
        users={users}
        projects={projects}
        labels={labels}
        cycles={cycles}
        onSelectTicket={onSelectTicket}
        onUpdateTicket={onUpdateTicket}
        onDeleteTicket={onDeleteTicket}
        onAddComment={onAddComment}
        onUpdateComment={onUpdateComment}
        onDeleteComment={onDeleteComment}
        onOpenCreateSubtask={onOpenCreateSubtask}
        ticketLink={ticketLink}
        onClose={() => navigate(`/workspaces/${activeWorkspaceId}/projects/${activeTicket.projectId}/tickets`)}
      />
    </>
  );
};
