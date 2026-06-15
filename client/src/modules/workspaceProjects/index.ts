export { WorkspaceProjectPanel } from './components/WorkspaceProjectPanel';
export { WorkspaceProjectPanelPage } from './screens/WorkspaceProjectPanelPage';
export { ProjectCreateOverlay } from './components/ProjectCreateOverlay';
export { ProjectSelectionRail } from './components/ProjectSelectionRail';
export { useWorkspaceProjectPanelLabelState, useWorkspaceProjectPanelProjectState } from './hooks';
export {
  DEFAULT_LABEL_COLOR,
  PROJECT_STATUS_LABELS,
  PROJECT_LIFECYCLE_OPTIONS,
  getNextLabelSortOrder,
  sanitizeProjectKey,
  validateGithubRepoUrl,
  createProjectSettingsFeedback,
} from './utils/WorkspaceProjectPanel';
export type {
  ProjectCreateOverlayProps,
  ProjectSelectionRailProps,
  WorkspaceProjectPanelProps,
  WorkspaceProjectsPageProps,
} from './types/WorkspaceProjectPanel';
export { WorkspaceProjectsPage } from './screens';
