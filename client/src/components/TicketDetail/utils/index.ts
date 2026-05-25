export const STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
  { value: 'canceled', label: 'Canceled' },
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
  STATUS_COLOR_MAP[status] ?? 'var(--text-muted)';

export const PRIORITY_OPTIONS = [
  { value: 'no_priority', label: 'No Priority' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];