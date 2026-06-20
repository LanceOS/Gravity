import type { MutableRefObject } from 'react';
import type { CreateProjectInput, Project, User } from '../../types/domain';
import type { ProjectLookupEntry } from './projectCacheUtils';

export interface ProjectContextType {
  projects: Project[];
  projectsLoading: boolean;
  projectLookup: Map<string, ProjectLookupEntry>;
  projectById: Map<string, Project>;
  projectsByWorkspaceId: Map<string, Project[]>;
  fetchInitialData: (userId?: string) => Promise<void>;
  fetchProjectData: (projectId: string) => Promise<void>;
  createProject: (project: CreateProjectInput) => Promise<Project | null>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<void>;
  joinProject: (inviteCode: string) => Promise<Project | null>;
}

export interface ProjectContextValueArgs {
  currentUser: User | null;
  setActiveProjectId: (id: string) => void;
  activeProjectIdRef: MutableRefObject<string>;
}
