export type WorkspaceDefaultView = 'board' | 'list';

const WORKSPACE_DEFAULT_VIEW_KEY = 'gravity_active_view';

const isWorkspaceDefaultView = (value: unknown): value is WorkspaceDefaultView =>
  value === 'board' || value === 'list';

export const getStoredWorkspaceDefaultView = (): WorkspaceDefaultView => {
  if (typeof window === 'undefined') {
    return 'board';
  }

  try {
    const storedView = window.localStorage.getItem(WORKSPACE_DEFAULT_VIEW_KEY);
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
    window.localStorage.setItem(WORKSPACE_DEFAULT_VIEW_KEY, view);
  } catch {
    // localStorage may be unavailable in restricted/private modes.
  }
};
