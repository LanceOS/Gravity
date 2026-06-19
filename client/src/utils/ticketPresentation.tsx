import { ArrowDown, ArrowRight, ArrowUp, MinusCircle, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Ticket } from '../context/TicketContextContext';

export const STATUS_COLOR_MAP: Record<string, string> = {
  backlog: '#9CA3AF',
  todo: '#3B82F6',
  in_progress: '#F59E0B',
  in_review: '#8B5CF6',
  done: '#10B981',
  canceled: '#EF4444',
};

export const PRIORITY_COLOR_BY_PRIORITY: Record<Ticket['priority'], string> = {
  urgent: '#ec4899',
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#3b82f6',
  no_priority: 'transparent',
};

export const getPriorityIcon = (priority: Ticket['priority'], size = 12): ReactNode => {
  switch (priority) {
    case 'urgent':
      return <TriangleAlert size={size} className="priority-urgent" />;
    case 'high':
      return <ArrowUp size={size} className="priority-high" />;
    case 'medium':
      return <ArrowRight size={size} className="priority-medium" />;
    case 'low':
      return <ArrowDown size={size} className="priority-low" />;
    default:
      return <MinusCircle size={size} className="priority-no" />;
  }
};

export const getPriorityColor = (priority: Ticket['priority']) =>
  PRIORITY_COLOR_BY_PRIORITY[priority] ?? 'transparent';

export const getAssigneeAvatar = (userAvatarById: Record<string, string>, assigneeId: string | null) => {
  if (!assigneeId) {
    return null;
  }

  return userAvatarById[assigneeId] || null;
};

export const getStatusLabel = (status: Ticket['status']) => {
  return status.replace('_', ' ').toUpperCase();
};

export const getStatusColor = (status: Ticket['status']) =>
  STATUS_COLOR_MAP[status] ?? 'var(--color-text-disabled)';

