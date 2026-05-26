export const STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog', color: '#9CA3AF' },
  { value: 'todo', label: 'Todo', color: '#3B82F6' },
  { value: 'in_progress', label: 'In Progress', color: '#F59E0B' },
  { value: 'in_review', label: 'In Review', color: '#8B5CF6' },
  { value: 'done', label: 'Done', color: '#10B981' },
  { value: 'canceled', label: 'Canceled', color: '#EF4444' },
];

export const STATUS_COLOR_MAP: Record<string, string> = {
  backlog: '#9CA3AF',
  todo: '#3B82F6',
  in_progress: '#F59E0B',
  in_review: '#8B5CF6',
  done: '#10B981',
  canceled: '#EF4444',
};

export const getStatusColor = (status: string) =>
  STATUS_COLOR_MAP[status] ?? 'var(--color-text-disabled)';

export const PRIORITY_OPTIONS = [
  { value: 'no_priority', label: 'No Priority' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];