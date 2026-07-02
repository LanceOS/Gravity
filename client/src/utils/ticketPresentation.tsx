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

const priorityIconsBySize = new Map<number, Record<Ticket['priority'], ReactNode>>();

function buildPriorityIconsBySize(size: number): Record<Ticket['priority'], ReactNode> {
  return {
    urgent: <TriangleAlert size={size} className="priority-urgent" />,
    high: <ArrowUp size={size} className="priority-high" />,
    medium: <ArrowRight size={size} className="priority-medium" />,
    low: <ArrowDown size={size} className="priority-low" />,
    no_priority: <MinusCircle size={size} className="priority-no" />,
  };
}

export const getPriorityIcon = (priority: Ticket['priority'], size = 12): ReactNode => {
  let icons = priorityIconsBySize.get(size);
  if (!icons) {
    icons = buildPriorityIconsBySize(size);
    priorityIconsBySize.set(size, icons);
  }

  return icons[priority];
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
