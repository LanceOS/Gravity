import type { Project } from '../../../context/TicketContext';
import type { ProjectSettingsFeedback } from '../types/WorkspaceProjectPanel';

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

export const DEFAULT_LABEL_COLOR = '#3b82f6';

export function sanitizeProjectKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export function getNextLabelSortOrder(nextLabels: { sortOrder?: number | null }[]): number {
  return nextLabels.reduce((maxSortOrder, next) => Math.max(maxSortOrder, Number(next.sortOrder ?? 0)), -1) + 1;
}

interface GithubUrlValidationResult {
  url: string | null;
  error: string | null;
}

export function validateGithubRepoUrl(value: string): GithubUrlValidationResult {
  const trimmedUrl = value.trim();

  if (!trimmedUrl) {
    return { url: null, error: null };
  }

  try {
    const parsed = new URL(trimmedUrl);
    const pathParts = parsed.pathname.split('/').filter(Boolean);

    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || pathParts.length < 2) {
      return {
        url: null,
        error: 'URL must be a valid GitHub repository URL (e.g. https://github.com/owner/repo).',
      };
    }

    return { url: trimmedUrl, error: null };
  } catch {
    return {
      url: null,
      error: 'Please enter a valid URL (e.g. https://github.com/owner/repo).',
    };
  }
}

export function createProjectSettingsFeedback(type: ProjectSettingsFeedback['type'], message: string): ProjectSettingsFeedback {
  if (!message) {
    return null;
  }

  return { type, message };
}
