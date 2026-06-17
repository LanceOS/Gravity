type TicketStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled';
type TicketPriority = 'no_priority' | 'low' | 'medium' | 'high' | 'urgent';

export type TicketStatusOption = {
  value: TicketStatus;
  label: string;
  color?: string;
};

export type TicketPriorityOption = {
  value: TicketPriority;
  label: string;
};

export type TicketSortOption = {
  value:
    | 'created'
    | 'label'
    | 'newest'
    | 'newest_urgent'
    | 'oldest'
    | 'priority_desc'
    | 'priority_asc'
    | 'updated_desc'
    | 'updated_asc';
  label: string;
};

export const BOARD_COLUMNS: Array<{ id: TicketStatus; title: string; color: string }> = [
  { id: 'backlog', title: 'Backlog', color: '#71717a' },
  { id: 'todo', title: 'Todo', color: '#3b82f6' },
  { id: 'in_progress', title: 'In Progress', color: '#f59e0b' },
  { id: 'in_review', title: 'In Review', color: '#aa3bff' },
  { id: 'done', title: 'Done', color: '#10b981' },
  { id: 'canceled', title: 'Canceled', color: '#ef4444' },
];

export const LIST_STATUS_ORDER: TicketStatus[] = [
  'in_review',
  'in_progress',
  'todo',
  'backlog',
  'done',
  'canceled',
];

export const STATUS_OPTIONS: TicketStatusOption[] = [
  { value: 'backlog', label: 'Backlog', color: '#9CA3AF' },
  { value: 'todo', label: 'Todo', color: '#3B82F6' },
  { value: 'in_progress', label: 'In Progress', color: '#F59E0B' },
  { value: 'in_review', label: 'In Review', color: '#8B5CF6' },
  { value: 'done', label: 'Done', color: '#10B981' },
  { value: 'canceled', label: 'Canceled', color: '#EF4444' },
];

export const PRIORITY_OPTIONS: TicketPriorityOption[] = [
  { value: 'no_priority', label: 'No Priority' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export const PRIORITY_FILTER_OPTIONS = [
  { value: '', label: 'Any Priority' },
  ...PRIORITY_OPTIONS.map((option) => option),
];

export const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Any Status' },
  ...STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
];

export const LIST_SORT_OPTIONS: Array<TicketSortOption> = [
  { value: 'created', label: 'Created Order' },
  { value: 'label', label: 'Labels' },
  { value: 'newest', label: 'Newest first' },
  { value: 'newest_urgent', label: 'Newest, urgent first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'priority_desc', label: 'Priority: high to low' },
  { value: 'priority_asc', label: 'Priority: low to high' },
  { value: 'updated_desc', label: 'Updated recently' },
  { value: 'updated_asc', label: 'Least recently updated' },
];
