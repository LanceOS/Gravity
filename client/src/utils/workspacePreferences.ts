import { WORKSPACE_DEFAULT_VIEW_STORAGE_KEY } from '../constants/storage';

export type WorkspaceDefaultView = 'board' | 'list';

const isWorkspaceDefaultView = (value: unknown): value is WorkspaceDefaultView =>
  value === 'board' || value === 'list';

export const getStoredWorkspaceDefaultView = (): WorkspaceDefaultView => {
  if (typeof window === 'undefined') {
    return 'board';
  }

  try {
    const storedView = window.localStorage.getItem(WORKSPACE_DEFAULT_VIEW_STORAGE_KEY);
    return isWorkspaceDefaultView(storedView) ? storedView : 'board';
  } catch {
    return 'board';
  }
};

export const setStoredWorkspaceDefaultView = (view: WorkspaceDefaultView): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(WORKSPACE_DEFAULT_VIEW_STORAGE_KEY, view);
  } catch {
    // localStorage may be unavailable in restricted/private modes.
  }
};
