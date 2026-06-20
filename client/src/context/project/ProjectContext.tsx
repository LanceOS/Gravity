import { createContext, useCallback, useContext, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@library';
import { apiClient } from '../../utils/apiClient';
import { CACHE_CONFIGS, queryKeys } from '../../utils/queryClient';
import type { CreateProjectInput, Project, Ticket, User } from '../../types/domain';
import {
  createProjectById,
  createProjectLookup,
  createProjectsByWorkspaceId,
  invalidateWorkspaceSidebarQueries as invalidateWorkspaceSidebarQueriesHelper,
} from './projectCacheUtils';
import type { ProjectContextType, ProjectContextValueArgs } from './ProjectContext.types';

export const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function useProjectContext(): ProjectContextType {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectContext must be used within a ProjectContext provider');
  }

  return context;
}

export function useProjectContextValue({
  currentUser,
  setActiveProjectId,
  activeProjectIdRef,
}: ProjectContextValueArgs): ProjectContextType {
  const queryClient = useQueryClient();

  const fetchProjects = useCallback(async () => {
    try {
      return await apiClient.get<Project[]>(`/projects`, { params: { userId: currentUser?.id } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load projects';
      if (toast?.show) {
        toast.show(message, 'error');
      }
      throw error;
    }
  }, [currentUser?.id]);

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(currentUser?.id),
    queryFn: fetchProjects,
    enabled: !!currentUser?.id,
    ...CACHE_CONFIGS.metadata,
  });

  const projects = Array.isArray(projectsQuery.data) ? projectsQuery.data : [];
  const projectLookup = useMemo(() => createProjectLookup(projects), [projects]);
  const projectById = useMemo(() => createProjectById(projects), [projects]);
  const projectsByWorkspaceId = useMemo(() => createProjectsByWorkspaceId(projects), [projects]);
  const projectsLoading = projectsQuery.isLoading;

  const invalidateWorkspaceSidebarQueries = useCallback((projectId?: string | null) => {
    invalidateWorkspaceSidebarQueriesHelper(queryClient, projectLookup, projectId);
  }, [projectLookup, queryClient]);

  const fetchInitialData = useCallback(async (userId?: string) => {
    if (!userId) {
      setActiveProjectId('');
      queryClient.clear();
      return;
    }

    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.projects(userId),
        queryFn: () => apiClient.get<Project[]>(`/projects`, { params: { userId } }),
        ...CACHE_CONFIGS.metadata,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.users(),
        queryFn: () => apiClient.get<User[]>(`/users`),
        ...CACHE_CONFIGS.metadata,
      }),
    ]);
  }, [queryClient, setActiveProjectId]);

  const fetchProjectData = useCallback(async (projectId: string) => {
    if (!projectId) return;

    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.tickets(projectId),
        queryFn: async () => {
          const data = await apiClient.get<Ticket[]>(`/tickets`, { projectId });
          return data;
        },
        ...CACHE_CONFIGS.ticketsList,
      }),
    ]);
  }, [queryClient]);

  const createProjectMutation = useMutation({
    mutationFn: async (projectInput: CreateProjectInput) => {
      if (!currentUser) throw new Error('Not signed in');
      return apiClient.post<Project>(`/projects`, {
        ...projectInput,
        ownerId: currentUser.id,
        status: projectInput.status || 'active',
      });
    },
    onSuccess: (project) => {
      if (currentUser) {
        queryClient.setQueryData<Project[]>(queryKeys.projects(currentUser.id), (old) => {
          return old ? [...old, project] : [project];
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects(currentUser.id) });
        invalidateWorkspaceSidebarQueries(project.id);
        setActiveProjectId(project.id);
      }
    },
  });

  const createProject = useCallback(async (projectInput: CreateProjectInput) => {
    try {
      return await createProjectMutation.mutateAsync(projectInput);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }, [createProjectMutation]);

  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Project> }) => {
      return apiClient.patch<Project>(`/projects/${id}`, updates);
    },
    onMutate: async ({ id, updates }) => {
      if (!currentUser) return;
      const queryKey = queryKeys.projects(currentUser.id);
      const previousProjects = queryClient.getQueryData<Project[]>(queryKey);

      if (previousProjects) {
        queryClient.setQueryData<Project[]>(queryKey, (old) =>
          old ? old.map((project) => (project.id === id ? { ...project, ...updates } : project)) : []
        );
      }

      return { previousProjects };
    },
    onError: (_error: unknown, _variables: { id: string; updates: Partial<Project> }, context: { previousProjects?: Project[] } | undefined) => {
      if (currentUser && context?.previousProjects) {
        queryClient.setQueryData(queryKeys.projects(currentUser.id), context.previousProjects);
      }
    },
    onSuccess: (project) => {
      if (project) {
        invalidateWorkspaceSidebarQueries(project.id);
      }
    },
    onSettled: () => {
      if (currentUser) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects(currentUser.id) });
      }
    },
  });

  const updateProject = useCallback(async (id: string, updates: Partial<Project>) => {
    try {
      return await updateProjectMutation.mutateAsync({ id, updates });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }, [updateProjectMutation]);

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/projects/${id}`);
    },
    onMutate: async (id) => {
      if (!currentUser) return;
      const queryKey = queryKeys.projects(currentUser.id);
      const previousProjects = queryClient.getQueryData<Project[]>(queryKey);

      if (previousProjects) {
        queryClient.setQueryData<Project[]>(queryKey, (old) =>
          old ? old.filter((project) => project.id !== id) : []
        );
      }

      if (activeProjectIdRef.current === id) {
        setActiveProjectId('');
      }

      return { previousProjects };
    },
    onError: (_error: unknown, _id: string, context: { previousProjects?: Project[] } | undefined) => {
      if (currentUser && context?.previousProjects) {
        queryClient.setQueryData(queryKeys.projects(currentUser.id), context.previousProjects);
      }
    },
    onSuccess: (_data, id) => {
      invalidateWorkspaceSidebarQueries(id);
    },
    onSettled: () => {
      if (currentUser) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects(currentUser.id) });
      }
    },
  });

  const deleteProject = useCallback(async (id: string) => {
    try {
      await deleteProjectMutation.mutateAsync(id);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }, [deleteProjectMutation]);

  const joinProjectMutation = useMutation({
    mutationFn: async (inviteCode: string) => {
      if (!currentUser) throw new Error('Not signed in');
      const data = await apiClient.post<{ project: Project }>(`/projects/invite/accept`, { inviteCode, userId: currentUser.id });
      return data.project;
    },
    onSuccess: (project) => {
      if (currentUser) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects(currentUser.id) });
        invalidateWorkspaceSidebarQueries(project.id);
        setActiveProjectId(project.id);
      }
    },
  });

  const joinProject = useCallback(async (inviteCode: string) => {
    try {
      return await joinProjectMutation.mutateAsync(inviteCode);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }, [joinProjectMutation]);

  return useMemo(() => ({
    projects,
    projectsLoading,
    projectLookup,
    projectById,
    projectsByWorkspaceId,
    fetchInitialData,
    fetchProjectData,
    createProject,
    updateProject,
    deleteProject,
    joinProject,
  }), [
    createProject,
    deleteProject,
    fetchInitialData,
    fetchProjectData,
    joinProject,
    projectById,
    projectLookup,
    projects,
    projectsByWorkspaceId,
    projectsLoading,
    updateProject,
  ]);
}
