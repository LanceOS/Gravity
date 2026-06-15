import type { Ticket } from '../../../context/TicketContext';
import type { TicketListSort } from './ticketView';
import {
  LIST_SORT_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
} from '../../../utils/ticketOptions';
import {
  getAssigneeAvatar as getSharedAssigneeAvatar,
  getPriorityIcon as getSharedPriorityIcon,
  getStatusColor as getSharedStatusColor,
  getStatusLabel as getSharedStatusLabel,
} from '../../../utils/ticketPresentation';

export const getPriorityIcon = (priority: Ticket['priority']) => getSharedPriorityIcon(priority, 14);
export const getStatusLabel = (status: Ticket['status']) => getSharedStatusLabel(status);
export const getStatusColor = (status: Ticket['status']) => getSharedStatusColor(status);
export const getAssigneeAvatar = (userAvatarById: Record<string, string>, assigneeId: string | null) =>
  getSharedAssigneeAvatar(userAvatarById, assigneeId);
