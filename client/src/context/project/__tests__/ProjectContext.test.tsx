import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '../../../utils/queryClient';
import { useProjectContextValue } from '../ProjectContext';
import type { ProjectContextType } from '../ProjectContext.types';
import type { Project, Ticket, User } from '../../../types/domain';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

const currentUser: User = {
  id: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  avatar: '',
  role: 'owner',
};

const baseProjects: Project[] = [
  {
    id: 'project-1',
    name: 'Gravity Core',
    description: '',
    key: 'GRA',
    status: 'active',
    workspaceId: 'workspace-1',
    teamId: 'team-1',
  },
  {
    id: 'project-2',
    name: 'Orbit Ops',
    description: '',
    key: 'ORB',
    status: 'planned',
    workspaceId: 'workspace-1',
    teamId: null,
  },
];

const ticketList: Ticket[] = [
  {
    id: 'ticket-1',
    key: 'GRA-1',
    title: 'Seed ticket',
    description: '',
    status: 'todo',
    priority: 'medium',
    assigneeId: null,
    projectId: 'project-1',
    domainId: null,
    cycleId: null,
    parentId: null,
    prStatus: 'none',
    prUrl: null,
    createdAt: '2026-06-18T12:00:00.000Z',
    updatedAt: '2026-06-18T12:00:00.000Z',
  },
];

let currentValue: ProjectContextType;

function Probe({
  currentUserId,
  activeProjectIdRef,
  setActiveProjectId,
}: {
  currentUserId: User | null;
  activeProjectIdRef: React.MutableRefObject<string>;
  setActiveProjectId: (id: string) => void;
}) {
  const value = useProjectContextValue({
    currentUser: currentUserId,
    setActiveProjectId,
    activeProjectIdRef,
  });

  React.useEffect(() => {
    currentValue = value;
  }, [value]);

  return null;
}

describe('ProjectContext', () => {
  afterEach(() => {
    currentValue = undefined as unknown as ProjectContextType;
    vi.unstubAllGlobals();
  });

  it('derives project lookup maps and prefetches project tickets', async () => {
    const queryClient = createQueryClient();
    const activeProjectIdRef = { current: 'project-1' };
    const setActiveProjectId = vi.fn((id: string) => {
      activeProjectIdRef.current = id;
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/v1/projects?userId=user-1' && method === 'GET') {
        return Promise.resolve(jsonResponse(baseProjects));
      }

      if (url === '/api/v1/tickets' && method === 'GET') {
        return Promise.resolve(jsonResponse(ticketList));
      }

      return Promise.resolve(jsonResponse([]));
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <Probe
          currentUserId={currentUser}
          activeProjectIdRef={activeProjectIdRef}
          setActiveProjectId={setActiveProjectId}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(currentValue).toBeDefined();
      expect(currentValue.projects).toHaveLength(2);
    });

    expect(currentValue.projectById.get('project-1')).toMatchObject({ id: 'project-1', name: 'Gravity Core' });
    expect(currentValue.projectsByWorkspaceId.get('workspace-1')?.map((project) => project.id)).toEqual(['project-1', 'project-2']);
    expect(currentValue.projectLookup.get('project-1')).toEqual({
      workspaceId: 'workspace-1',
      teamId: 'team-1',
    });
    expect(currentValue.projectsLoading).toBe(false);

    await act(async () => {
      await currentValue.fetchProjectData('project-1');
    });

    expect(queryClient.getQueryData<Ticket[]>(queryKeys.tickets('project-1'))).toEqual(ticketList);
  });

  it('clears query caches and resets the active project when initial data is fetched without a user', async () => {
    const queryClient = createQueryClient();
    const clearSpy = vi.spyOn(queryClient, 'clear');
    const activeProjectIdRef = { current: 'project-1' };
    const setActiveProjectId = vi.fn((id: string) => {
      activeProjectIdRef.current = id;
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Probe
          currentUserId={null}
          activeProjectIdRef={activeProjectIdRef}
          setActiveProjectId={setActiveProjectId}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(currentValue).toBeDefined();
    });

    await act(async () => {
      await currentValue.fetchInitialData();
    });

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(setActiveProjectId).toHaveBeenCalledWith('');
  });

  it('preserves cache updates and active project side effects across create, update, delete, and join flows', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.workspaceSidebarTree('workspace-1'), { workspaceId: 'workspace-1', teams: [] });
    queryClient.setQueryData(queryKeys.workspaceSidebarTree('workspace-2'), { workspaceId: 'workspace-2', teams: [] });
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const activeProjectIdRef = { current: 'project-1' };
    const setActiveProjectId = vi.fn((id: string) => {
      activeProjectIdRef.current = id;
    });

    const createdProject: Project = {
      id: 'project-3',
      name: 'Created project',
      description: '',
      key: 'CRT',
      status: 'active',
      workspaceId: 'workspace-1',
      teamId: 'team-1',
    };
    const updatedProject: Project = {
      ...baseProjects[0],
      name: 'Gravity Core Renamed',
    };
    const joinedProject: Project = {
      id: 'project-4',
      name: 'Joined project',
      description: '',
      key: 'JON',
      status: 'active',
      workspaceId: 'workspace-2',
      teamId: null,
    };

    let serverProjects = [...baseProjects];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/v1/projects?userId=user-1' && method === 'GET') {
        return Promise.resolve(jsonResponse(serverProjects));
      }

      if (url === '/api/v1/projects' && method === 'POST') {
        serverProjects = [...serverProjects, createdProject];
        return Promise.resolve(jsonResponse(createdProject));
      }

      if (url === '/api/v1/projects/project-1' && method === 'PATCH') {
        serverProjects = serverProjects.map((project) => (project.id === 'project-1' ? updatedProject : project));
        return Promise.resolve(jsonResponse(updatedProject));
      }

      if (url === '/api/v1/projects/project-2' && method === 'DELETE') {
        serverProjects = serverProjects.filter((project) => project.id !== 'project-2');
        return Promise.resolve(jsonResponse({ success: true }));
      }

      if (url === '/api/v1/projects/invite/accept' && method === 'POST') {
        serverProjects = [...serverProjects, joinedProject];
        return Promise.resolve(jsonResponse({ project: joinedProject }));
      }

      return Promise.resolve(jsonResponse([]));
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <Probe
          currentUserId={currentUser}
          activeProjectIdRef={activeProjectIdRef}
          setActiveProjectId={setActiveProjectId}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(currentValue.projects).toHaveLength(2);
    });

    await act(async () => {
      const result = await currentValue.createProject({
        name: createdProject.name,
        description: createdProject.description,
        key: createdProject.key,
        workspaceId: createdProject.workspaceId || undefined,
        teamId: createdProject.teamId || undefined,
      });

      expect(result).toMatchObject(createdProject);
    });

    expect(queryClient.getQueryData<Project[]>(queryKeys.projects(currentUser.id))).toEqual([
      ...baseProjects,
      createdProject,
    ]);
    expect(setActiveProjectId).toHaveBeenCalledWith(createdProject.id);
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.workspaceSidebarTree('workspace-1'), exact: true });

    await act(async () => {
      const result = await currentValue.updateProject('project-1', { name: updatedProject.name });
      expect(result).toMatchObject(updatedProject);
    });

    expect(queryClient.getQueryData<Project[]>(queryKeys.projects(currentUser.id))?.find((project) => project.id === 'project-1'))
      .toMatchObject({ name: 'Gravity Core Renamed' });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.workspaceSidebarTree('workspace-1'), exact: true });

    activeProjectIdRef.current = 'project-2';
    await act(async () => {
      await currentValue.deleteProject('project-2');
    });

    expect(setActiveProjectId).toHaveBeenCalledWith('');
    expect(queryClient.getQueryData<Project[]>(queryKeys.projects(currentUser.id))?.some((project) => project.id === 'project-2')).toBe(false);
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.workspaceSidebarTree('workspace-1'), exact: true });

    await act(async () => {
      const result = await currentValue.joinProject('invite-code');
      expect(result).toMatchObject(joinedProject);
    });

    expect(setActiveProjectId).toHaveBeenCalledWith(joinedProject.id);
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: queryKeys.workspaceSidebarTree('workspace-2'), exact: true });
  });
});
