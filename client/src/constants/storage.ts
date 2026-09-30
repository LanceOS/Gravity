/** Theme preference saved in localStorage. */
export const THEME_STORAGE_KEY = 'gravity_theme';

/** Default workspace board/list view saved in localStorage. */
export const WORKSPACE_DEFAULT_VIEW_STORAGE_KEY = 'gravity_active_view';

/** Density preference saved in localStorage. */
export const DENSITY_STORAGE_KEY = 'ds-density';

/** Enables the client performance profiling log when set to `1`. */
export const PERFORMANCE_PROFILE_STORAGE_KEY = 'gravity-perf-profile';

/** Prefix for sessionStorage drafts; the suffix scopes a draft to its user, project, and note. */
export const NOTE_DRAFT_STORAGE_PREFIX = 'gravity:note-draft:';

/** Stable sessionStorage key for one user's draft of one note in one project. */
export function getNoteDraftStorageKey(userId: string, projectId: string, noteId: string): string {
  return `${NOTE_DRAFT_STORAGE_PREFIX}${JSON.stringify([userId, projectId, noteId])}`;
}

/** Session-scoped feedback state for copying workspace invite details. */
export const COPY_FEEDBACK_STORAGE_KEY = 'gravity_peer_invite_copy_feedback';
