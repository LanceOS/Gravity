import { ArrowDown, ArrowRight, ArrowUp, Minus, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Domain, Project, Ticket } from '../../../context/TicketContext';

const PRIORITY_FILTER_VALUES: Array<[string, string]> = [
  ['', 'Any Priority'],
  ['urgent', 'Urgent'],
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
  ['no_priority', 'No Priority'],
];

export const PRIORITY_FILTER_OPTIONS = PRIORITY_FILTER_VALUES.map(([value, label]) => ({
  value,
  label,
}));


export function getPriorityIcon(priority: Ticket['priority']): ReactNode {
  switch (priority) {
    case 'urgent':
      return <ShieldAlert size={12} className="priority-urgent" />;
    case 'high':
      return <ArrowUp size={12} className="priority-high" />;
    case 'medium':
      return <ArrowRight size={12} className="priority-medium" />;
    case 'low':
      return <ArrowDown size={12} className="priority-low" />;
    default:
      return <Minus size={12} className="priority-no" />;
  }
}

export function getPriorityColor(priority: Ticket['priority']) {
  switch (priority) {
    case 'urgent':
      return '#ec4899';
    case 'high':
      return '#ef4444';
    case 'medium':
      return '#f59e0b';
    case 'low':
      return '#3b82f6';
    default:
      return 'transparent';
  }
}

export function getDomainMeta(domainById: Record<string, Domain>, domainId: string | null) {
  if (!domainId) {
    return { color: 'transparent', name: '' };
  }

  const domain = domainById[domainId];
  return domain ? { color: domain.color, name: domain.name } : { color: 'transparent', name: '' };
}

export function getAssigneeAvatar(userAvatarById: Record<string, string>, assigneeId: string | null) {
  if (!assigneeId) {
    return null;
  }

  return userAvatarById[assigneeId] || null;
}