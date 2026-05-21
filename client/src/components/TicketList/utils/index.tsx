import { ArrowDown, ArrowRight, ArrowUp, Minus, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Domain, Ticket } from '../../../context/TicketContext';

export const PRIORITY_FILTER_OPTIONS = [
  { value: '', label: 'Any Priority' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'no_priority', label: 'No Priority' },
];

export const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Any Status' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
  { value: 'canceled', label: 'Canceled' },
];

export function getPriorityIcon(priority: Ticket['priority']): ReactNode {
  switch (priority) {
    case 'urgent':
      return <ShieldAlert size={14} className="priority-urgent" />;
    case 'high':
      return <ArrowUp size={14} className="priority-high" />;
    case 'medium':
      return <ArrowRight size={14} className="priority-medium" />;
    case 'low':
      return <ArrowDown size={14} className="priority-low" />;
    default:
      return <Minus size={14} className="priority-no" />;
  }
}

export function getStatusLabel(status: Ticket['status']) {
  return status.replace('_', ' ').toUpperCase();
}

export function getAssigneeAvatar(userAvatarById: Record<string, string>, assigneeId: string | null) {
  if (!assigneeId) {
    return null;
  }

  return userAvatarById[assigneeId] || null;
}

export function getDomainTag(domainById: Record<string, Domain>, domainId: string | null): ReactNode {
  if (!domainId) {
    return null;
  }

  const domain = domainById[domainId];
  return domain ? (
    <span
      style={{
        fontSize: '11px',
        padding: '2px 6px',
        borderRadius: '4px',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${domain.color}40`,
        color: domain.color,
      }}
    >
      {domain.name}
    </span>
  ) : null;
}