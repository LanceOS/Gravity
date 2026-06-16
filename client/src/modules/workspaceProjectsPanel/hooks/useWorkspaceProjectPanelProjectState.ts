import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';

import type { Project } from '../../../../context/TicketContext';
import type { ProjectSettingsFeedback } from '../types/WorkspaceProjectPanel';

export interface UseWorkspaceProjectPanelProjectStateArgs {
  projects: Project[];
  activeProjectId: string;
}

export interface UseWorkspaceProjectPanelProjectStateResult {
  managedProjectId: string;
  setManagedProjectId: Dispatch<SetStateAction<string>>;
  managedProject: Project | null;
  currentProject: Project | null;
  projectStrip: Project[];
  shouldShowLabels: boolean;
  isProjectSettingsSaving: boolean;
  setIsProjectSettingsSaving: Dispatch<SetStateAction<boolean>>;
  settingsFeedback: ProjectSettingsFeedback;
  setSettingsFeedback: Dispatch<SetStateAction<ProjectSettingsFeedback>>;
  githubRepoUrl: string;
  setGithubRepoUrl: Dispatch<SetStateAction<string>>;
}

function createProjectLookup(projects: Project[]): Map<string, Project> {
  const lookup = new Map<string, Project>();

  for (const project of projects) {
    lookup.set(project.id, project);
  }

  return lookup;
}

function resolveManagedProjectId({
  projects,
  activeProjectId,
  managedProjectId,
}: {
  projects: Project[];
  activeProjectId: string;
  managedProjectId: string;
}): string {
  if (!projects.length) {
    return '';
  }

  if (activeProjectId && projects.some((project) => project.id === activeProjectId)) {
    return activeProjectId;
  }

  if (managedProjectId && projects.some((project) => project.id === managedProjectId)) {
    return managedProjectId;
  }

  return projects[0].id;
}

export function useWorkspaceProjectPanelProjectState({
  projects,
  activeProjectId,
}: UseWorkspaceProjectPanelProjectStateArgs): UseWorkspaceProjectPanelProjectStateResult {
  const [managedProjectId, setManagedProjectId] = useState('');
  const [isProjectSettingsSaving, setIsProjectSettingsSaving] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<ProjectSettingsFeedback>(null);
  const [githubRepoUrl, setGithubRepoUrl] = useState('');

  const projectLookup = useMemo(() => createProjectLookup(projects), [projects]);

  const managedProject = useMemo(() => projectLookup.get(managedProjectId) || null, [managedProjectId, projectLookup]);

  const currentProject = useMemo(
    () => projectLookup.get(activeProjectId) || managedProject || projects[0] || null,
    [activeProjectId, managedProject, projectLookup, projects]
  );

  const projectStrip = useMemo(() => {
    if (!currentProject) {
      return projects;
    }

    return [currentProject, ...projects.filter((project) => project.id !== currentProject.id)];
  }, [currentProject, projects]);

  const shouldShowLabels = true;

  useEffect(() => {
    setManagedProjectId((currentId) =>
      resolveManagedProjectId({
        projects,
        activeProjectId,
        managedProjectId: currentId,
      })
    );
  }, [activeProjectId, projects]);

  useEffect(() => {
    if (!managedProject) {
      setGithubRepoUrl('');
      setSettingsFeedback(null);
      return;
    }

    setGithubRepoUrl(managedProject.githubRepoUrl || '');
    setSettingsFeedback(null);
  }, [managedProject]);

  return {
    managedProjectId,
    setManagedProjectId,
    managedProject,
    currentProject,
    projectStrip,
    shouldShowLabels,
    isProjectSettingsSaving,
    setIsProjectSettingsSaving,
    settingsFeedback,
    setSettingsFeedback,
    githubRepoUrl,
    setGithubRepoUrl,
  };
}
