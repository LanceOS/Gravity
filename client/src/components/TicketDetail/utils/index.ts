export const STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
  { value: 'canceled', label: 'Canceled' },
];

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'backlog': return '#9CA3AF';
    case 'todo': return '#3B82F6';
    case 'in_progress': return '#F59E0B';
    case 'in_review': return '#8B5CF6';
    case 'done': return '#10B981';
    case 'canceled': return '#EF4444';
    default: return 'var(--text-muted)';
  }
};

export const PRIORITY_OPTIONS = [
  { value: 'no_priority', label: 'No Priority' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];