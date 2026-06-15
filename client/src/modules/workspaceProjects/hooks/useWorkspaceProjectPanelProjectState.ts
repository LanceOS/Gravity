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

export function useWorkspaceProjectPanelProjectState({
  projects,
  activeProjectId,
}: UseWorkspaceProjectPanelProjectStateArgs): UseWorkspaceProjectPanelProjectStateResult {
  const [managedProjectId, setManagedProjectId] = useState('');
  const [isProjectSettingsSaving, setIsProjectSettingsSaving] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<ProjectSettingsFeedback>(null);
  const [githubRepoUrl, setGithubRepoUrl] = useState('');

  const managedProject = useMemo(
    () => projects.find((project) => project.id === managedProjectId) || null,
    [projects, managedProjectId]
  );

  const currentProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || managedProject || projects[0] || null,
    [activeProjectId, managedProject, projects]
  );

  const projectStrip = useMemo(() => {
    if (!currentProject) {
      return projects;
    }

    return [currentProject, ...projects.filter((project) => project.id !== currentProject.id)];
  }, [currentProject, projects]);

  const shouldShowLabels = useMemo(() => {
    if (!activeProjectId) {
      return true;
    }

    return managedProject?.id === activeProjectId;
  }, [activeProjectId, managedProject]);

  useEffect(() => {
    if (projects.length === 0) {
      setManagedProjectId('');
      return;
    }

    if (activeProjectId && projects.some((project) => project.id === activeProjectId)) {
      setManagedProjectId(activeProjectId);
      return;
    }

    if (!projects.some((project) => project.id === managedProjectId)) {
      setManagedProjectId(projects[0].id);
    }
  }, [activeProjectId, managedProjectId, projects]);

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
