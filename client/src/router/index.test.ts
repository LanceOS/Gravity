import { describe, expect, it } from 'vitest';
import { staticProtectedRoutePaths, workspaceShellRoutePaths } from './index';

describe('router configuration', () => {
  it('builds workspace shell routes from data-driven groups', () => {
    expect(workspaceShellRoutePaths).toContain('/workspaces/:workspaceId');
    expect(workspaceShellRoutePaths).toContain('/workspaces/:workspaceId/projects');
    expect(workspaceShellRoutePaths).toContain('/workspaces/:workspaceId/projects/:projectId/tickets');
    expect(workspaceShellRoutePaths).toContain('/workspaces/:workspaceId/teams/:teamId/projects/:projectId/notes/:noteId');
    expect(new Set(workspaceShellRoutePaths).size).toBe(workspaceShellRoutePaths.length);
  });

  it('keeps expected count of shell routes', () => {
    expect(workspaceShellRoutePaths).toHaveLength(19);
  });

  it('includes static protected route paths for legacy and account screens', () => {
    expect(staticProtectedRoutePaths).toContain('/account');
    expect(staticProtectedRoutePaths).toContain('/workspaces/:workspaceId/teams/:teamId/domains/:domainId');
    expect(staticProtectedRoutePaths).toContain('/workspaces/:workspaceId/projects/:projectId');
    expect(staticProtectedRoutePaths).toContain('/workspaces/:workspaceId/settings');
  });
});
