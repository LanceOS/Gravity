import type { Ticket } from '../../../context/TicketContext';
import type { TicketListSort } from './ticketView';
import {
  getAssigneeAvatar as getSharedAssigneeAvatar,
  getPriorityIcon as getSharedPriorityIcon,
  getStatusColor as getSharedStatusColor,
  getStatusLabel as getSharedStatusLabel,
} from '../../../utils/ticketPresentation';

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

export const LIST_SORT_OPTIONS: Array<{ value: TicketListSort; label: string }> = [
  { value: 'created', label: 'Created Order' },
  { value: 'label', label: 'Labels' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'priority_desc', label: 'Priority: high to low' },
  { value: 'priority_asc', label: 'Priority: low to high' },
  { value: 'updated_desc', label: 'Updated recently' },
  { value: 'updated_asc', label: 'Least recently updated' },
];

export const getPriorityIcon = (priority: Ticket['priority']) => getSharedPriorityIcon(priority, 14);
export const getStatusLabel = (status: Ticket['status']) => getSharedStatusLabel(status);
export const getStatusColor = (status: Ticket['status']) => getSharedStatusColor(status);
export const getAssigneeAvatar = (userAvatarById: Record<string, string>, assigneeId: string | null) =>
  getSharedAssigneeAvatar(userAvatarById, assigneeId);
