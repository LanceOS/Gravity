import type { Project } from '../../../context/TicketContext';
import type { ProjectSettingsFeedback } from '../types/WorkspaceProjectPanel';
import { sanitizeProjectKey, type GithubRepoValidationResult, validateGithubRepoUrl } from '../../../utils/project';

export interface WorkspaceProjectCreateInput {
  name: string;
  description: string;
  key: string;
}

export interface WorkspaceProjectCreatePayload {
  name: string;
  description: string;
  key: string;
}

export interface WorkspaceProjectCreateValidationResult {
  value: WorkspaceProjectCreatePayload;
  error: string | null;
}

export interface WorkspaceProjectPanelLabelFormInput {
  name: string;
  color: string;
  description: string;
}

export interface WorkspaceProjectPanelLabelPayload {
  name: string;
  color: string;
  description: string;
}

export interface WorkspaceProjectPanelLabelValidationResult {
  value: WorkspaceProjectPanelLabelPayload;
  error: string | null;
}

export interface WorkspaceProjectPanelCreateProjectFormFactory {
  sanitizeProjectKey: (value: string) => string;
  buildPayload: (input: WorkspaceProjectCreateInput) => WorkspaceProjectCreatePayload;
  normalizeFieldState: (input: WorkspaceProjectCreateInput) => WorkspaceProjectCreatePayload;
  validatePayload: (payload: WorkspaceProjectCreatePayload) => string | null;
  buildValidatedPayload: (input: WorkspaceProjectCreateInput) => WorkspaceProjectCreateValidationResult;
}

export interface WorkspaceProjectPanelLabelFormFactory {
  sanitizeLabelName: (value: string) => string;
  buildPayload: (input: WorkspaceProjectPanelLabelFormInput) => WorkspaceProjectPanelLabelPayload;
  normalizeFieldState: (input: WorkspaceProjectPanelLabelFormInput) => WorkspaceProjectPanelLabelPayload;
  validatePayload: (payload: WorkspaceProjectPanelLabelPayload) => string | null;
  buildValidatedPayload: (input: WorkspaceProjectPanelLabelFormInput) => WorkspaceProjectPanelLabelValidationResult;
}

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

export function getNextLabelSortOrder(nextLabels: { sortOrder?: number | null }[]): number {
  return nextLabels.reduce((maxSortOrder, next) => Math.max(maxSortOrder, Number(next.sortOrder ?? 0)), -1) + 1;
}

export type { GithubRepoValidationResult };
export { validateGithubRepoUrl };

export function createProjectSettingsFeedback(type: ProjectSettingsFeedback['type'], message: string): ProjectSettingsFeedback {
  if (!message) {
    return null;
  }

  return { type, message };
}

export function createWorkspaceProjectPanelCreateProjectFormFactory(): WorkspaceProjectPanelCreateProjectFormFactory {
  const normalizeProjectInput = (input: WorkspaceProjectCreateInput): WorkspaceProjectCreatePayload => ({
    name: input.name.trim(),
    key: sanitizeProjectKey(input.key),
    description: input.description.trim(),
  });

  const validate = (payload: WorkspaceProjectCreatePayload): string | null => {
    if (!payload.name) {
      return 'Please enter a project name.';
    }

    if (!payload.key) {
      return 'Please enter a project key.';
    }

    return null;
  };

  return {
    sanitizeProjectKey,
    buildPayload: normalizeProjectInput,
    normalizeFieldState: normalizeProjectInput,
    validatePayload: validate,
    buildValidatedPayload: (input: WorkspaceProjectCreateInput) => {
      const value = normalizeProjectInput(input);
      return { value, error: validate(value) };
    },
  };
}

export function createWorkspaceProjectPanelLabelFormFactory(): WorkspaceProjectPanelLabelFormFactory {
  const normalizeLabelInput = (input: WorkspaceProjectPanelLabelFormInput): WorkspaceProjectPanelLabelPayload => ({
    name: input.name.trim(),
    color: input.color,
    description: input.description.trim(),
  });

  const validate = (payload: WorkspaceProjectPanelLabelPayload): string | null => {
    if (!payload.name) {
      return 'Please enter a label name.';
    }

    return null;
  };

  const sanitizeLabelName = (value: string) => value.trim();

  return {
    sanitizeLabelName,
    buildPayload: normalizeLabelInput,
    normalizeFieldState: normalizeLabelInput,
    validatePayload: validate,
    buildValidatedPayload: (input: WorkspaceProjectPanelLabelFormInput) => {
      const value = normalizeLabelInput(input);
      return { value, error: validate(value) };
    },
  };
}
