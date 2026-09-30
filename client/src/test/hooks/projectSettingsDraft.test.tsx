import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useWorkspaceProjectPanelProjectState } from '../../modules/workspaceProjectsPanel/hooks/useWorkspaceProjectPanelProjectState';
import type { Project } from '../../types/domain';

const project = { id: 'p', name: 'Project', githubRepoUrl: 'https://github.com/org/old' } as Project;
function setup() {
  return renderHook(({ projects }) => useWorkspaceProjectPanelProjectState({ projects, activeProjectId: projects[0].id }), { initialProps: { projects: [project] } });
}

describe('project repository draft', () => {
  it('refreshes a pristine repository URL for the same project', () => {
    const { result, rerender } = setup();
    expect(result.current.githubRepoUrl).toBe(project.githubRepoUrl);
    rerender({ projects: [{ ...project, githubRepoUrl: 'https://github.com/org/new' }] });
    expect(result.current.githubRepoUrl).toBe('https://github.com/org/new');
  });

  it('preserves local edits across refreshes and resumes syncing after reverting', () => {
    const { result, rerender } = setup();
    act(() => result.current.setGithubRepoUrl('https://github.com/org/draft'));
    rerender({ projects: [{ ...project, githubRepoUrl: 'https://github.com/org/new' }] });
    expect(result.current.githubRepoUrl).toBe('https://github.com/org/draft');
    act(() => result.current.setGithubRepoUrl('https://github.com/org/new'));
    rerender({ projects: [{ ...project, githubRepoUrl: 'https://github.com/org/newer' }] });
    expect(result.current.githubRepoUrl).toBe('https://github.com/org/newer');
  });

  it('retains a failed draft through optimistic updates and rollback', () => {
    const { result, rerender } = setup();
    act(() => {
      result.current.setGithubRepoUrl('https://github.com/org/draft');
      result.current.setIsProjectSettingsSaving(true);
    });
    rerender({ projects: [{ ...project, githubRepoUrl: 'https://github.com/org/draft' }] });
    rerender({ projects: [project] });
    act(() => result.current.setIsProjectSettingsSaving(false));
    expect(result.current.githubRepoUrl).toBe('https://github.com/org/draft');
    rerender({ projects: [{ ...project, id: 'other', githubRepoUrl: 'https://github.com/org/other' }] });
    expect(result.current.githubRepoUrl).toBe('https://github.com/org/other');
  });

  it('accepts refreshes after a successful save establishes a new baseline', () => {
    const { result, rerender } = setup();
    act(() => {
      result.current.setGithubRepoUrl('https://github.com/org/saved');
      result.current.setIsProjectSettingsSaving(true);
    });
    rerender({ projects: [{ ...project, githubRepoUrl: 'https://github.com/org/saved' }] });
    act(() => result.current.setIsProjectSettingsSaving(false));
    rerender({ projects: [{ ...project, githubRepoUrl: 'https://github.com/org/newer' }] });
    expect(result.current.githubRepoUrl).toBe('https://github.com/org/newer');
  });
});
