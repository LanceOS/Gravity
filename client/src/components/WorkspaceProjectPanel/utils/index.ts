import type { Project } from '../../../context/TicketContext';

export const PROJECT_STATUS_LABELS: Record<Project['status'], string> = {
  planned: 'Planned',
  active: 'Active',
  completed: 'Archived',
};

export const PROJECT_LIFECYCLE_OPTIONS = [
  { value: 'planned', label: 'Planned' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Archived' },
];

export function sanitizeProjectKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}