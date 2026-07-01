import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../utils/apiClient';
import { queryKeys, CACHE_CONFIGS } from '../../utils/queryClient';
import { useActiveProject } from '../project/ActiveProjectContext';
import { useProjectContext } from '../project/ProjectContext';
import { useAuth } from '../auth/AuthContext';
import { patchTicketLabelAssignment, patchTicketInAllCaches, invalidateTicketCaches } from '../shared';
import { toast } from '@library';
import { TicketFiltersContext } from '../filters/TicketFiltersContext';
import type { LabelContextType } from './LabelContext.types';
import type { Label, Ticket } from '../../types/domain';

export const LabelContext = createContext<LabelContextType | undefined>(undefined);

export const useLabels = () => {
  const context = useContext(LabelContext);
  if (!context) {
    throw new Error('useLabels must be used within a LabelProvider');
  }
  return context;
};

export const LabelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const { activeProjectId, activeProjectIdRef } = useActiveProject();
  const { currentUser } = useAuth();
  const { projects } = useProjectContext();
  const filtersContext = useContext(TicketFiltersContext);
  const isProjectScopeAligned = !filtersContext || filtersContext.filters.projectId === activeProjectId;

  const labelsQuery = useQuery({
    queryKey: queryKeys.labels(activeProjectId),
    queryFn: () => apiClient.get<Label[]>(`/labels`, {
      params: { projectId: activeProjectId },
      projectId: activeProjectId,
    }),
    enabled: !!activeProjectId && isProjectScopeAligned && !!currentUser,
    ...CACHE_CONFIGS.metadata,
  });

  const labels = labelsQuery.data || [];
  const labelById = useMemo(() => new Map(labels.map((label) => [label.id, label] as const)), [labels]);

  const findLabelQueryKey = useCallback(
    (labelId: string, projectId?: string | null) => {
      const projectIdsToProbe: string[] = [];
      const seenProjectIds = new Set<string>();
      const pushProjectId = (candidate: string) => {
        if (!seenProjectIds.has(candidate)) {
          seenProjectIds.add(candidate);
          projectIdsToProbe.push(candidate);
        }
      };

      if (projectId) {
        pushProjectId(projectId);
      } else if (activeProjectId) {
        pushProjectId(activeProjectId);
      }

      for (const project of projects) {
        pushProjectId(project.id);
      }

      for (const probeProjectId of projectIdsToProbe) {
        const queryKey = queryKeys.labels(probeProjectId);
        const cachedLabels = queryClient.getQueryData<Label[]>(queryKey);

        if (Array.isArray(cachedLabels) && cachedLabels.some((label) => label.id === labelId)) {
          return queryKey;
        }
      }

      return null;
    },
    [activeProjectId, projects, queryClient]
  );

  const invalidateLabelQueries = useCallback(
    (labelId: string, projectId?: string | null) => {
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.labels(projectId), exact: true });
        return;
      }

      const labelQueryKey = findLabelQueryKey(labelId);
      if (labelQueryKey) {
        queryClient.invalidateQueries({ queryKey: [...labelQueryKey], exact: true });
      }
    },
    [findLabelQueryKey, queryClient]
  );

  const resolveTicketProjectId = useCallback(
    (ticketId: string) => {
      return queryClient.getQueryData<Ticket>(queryKeys.ticketDetail(ticketId))?.projectId || activeProjectIdRef.current;
    },
    [activeProjectIdRef, queryClient]
  );

  const handleTicketLabelUpdate = useCallback((ticketId: string, labelId: string, isAssigned: boolean) => {
    const label = labelById.get(labelId);
    const projectId = resolveTicketProjectId(ticketId);
    patchTicketInAllCaches(queryClient, ticketId, (ticket) => 
      patchTicketLabelAssignment(ticket, labelId, isAssigned, label),
      projectId ? { projectId } : undefined
    );
  }, [labelById, queryClient, resolveTicketProjectId]);

  const showLabelMutationError = useCallback((error: unknown, action: 'assign' | 'unassign') => {
    if (toast?.show) {
      const errorMessage = error instanceof Error ? error.message : `Failed to ${action} label`;
      const message = `Unable to ${action} label.`;
      toast.show(errorMessage.includes('label') ? errorMessage : message, 'error');
    }
  }, []);

  const createLabelMutation = useMutation({
    mutationFn: async (labelInput: { name: string; color?: string; description?: string; projectId?: string; sortOrder?: number }) => {
      const projectId = labelInput.projectId || activeProjectIdRef.current;
      const cachedProjectLabels = queryClient.getQueryData<Label[]>(queryKeys.labels(projectId));
      const existingProjectLabels: Label[] = Array.isArray(cachedProjectLabels)
        ? cachedProjectLabels
        : projectId === activeProjectIdRef.current
          ? labels
          : [];
      const nextSortOrder =
        labelInput.sortOrder ??
        existingProjectLabels.reduce((maxSortOrder, label) => Math.max(maxSortOrder, Number(label.sortOrder ?? 0)), -1) + 1;

      return apiClient.post<Label>(`/labels`, {
        projectId,
        name: labelInput.name,
        color: labelInput.color || '#6B7280',
        description: labelInput.description || '',
        sortOrder: nextSortOrder,
      }, { projectId });
    },
    onSuccess: (label) => {
      if (label?.id) {
        invalidateLabelQueries(label.id, label.projectId);
      }
    },
  });

  const createLabel = useCallback(async (labelInput: { name: string; color?: string; description?: string; projectId?: string; sortOrder?: number }) => {
    try {
      return await createLabelMutation.mutateAsync(labelInput);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, [createLabelMutation]);

  const updateLabelMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Label> }) => {
      return apiClient.put<Label>(`/labels/${id}`, updates);
    },
    onMutate: async ({ id }) => {
      const cachedLabel = labelById.get(id);
      return { previousLabelProjectId: cachedLabel?.projectId };
    },
    onSuccess: (updatedLabel, { id }) => {
      invalidateLabelQueries(id, updatedLabel?.projectId);
      return updatedLabel;
    },
    onError: (_error, _variables, context: { previousLabelProjectId?: string | null } | undefined) => {
      if (context?.previousLabelProjectId) {
        invalidateLabelQueries(context.previousLabelProjectId);
      }
    },
  });

  const updateLabel = useCallback(async (id: string, updates: Partial<Label>) => {
    try {
      return await updateLabelMutation.mutateAsync({ id, updates });
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, [updateLabelMutation]);

  const deleteLabelMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/labels/${id}`);
      return id;
    },
    onMutate: async (id) => {
      const cachedLabel = labelById.get(id);
      return { projectId: cachedLabel?.projectId };
    },
    onSuccess: (_result, id, context: { projectId?: string | null } | undefined) => {
      invalidateLabelQueries(id, context?.projectId);
    },
  });

  const deleteLabel = useCallback(async (id: string) => {
    try {
      await deleteLabelMutation.mutateAsync(id);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, [deleteLabelMutation]);

  const assignLabelMutation = useMutation({
    mutationFn: async ({ ticketId, labelId }: { ticketId: string; labelId: string }) => {
      await apiClient.post(`/tickets/${ticketId}/labels`, { labelId });
    },
    onMutate: ({ ticketId, labelId }) => {
      handleTicketLabelUpdate(ticketId, labelId, true);
      return { ticketId, labelId, projectId: resolveTicketProjectId(ticketId) };
    },
    onError: (error, variables) => {
      handleTicketLabelUpdate(variables.ticketId, variables.labelId, false);
      showLabelMutationError(error, 'assign');
      const resolvedProjectId = resolveTicketProjectId(variables.ticketId) || undefined;
      const resolvedTicketKey = queryClient.getQueryData<Ticket>(queryKeys.ticketDetail(variables.ticketId))?.key?.toUpperCase();
      invalidateTicketCaches(queryClient, variables.ticketId, resolvedProjectId, resolvedTicketKey);
    },
    onSuccess: (_result, variables) => {
      const resolvedProjectId = resolveTicketProjectId(variables.ticketId) || undefined;
      const resolvedTicketKey = queryClient.getQueryData<Ticket>(queryKeys.ticketDetail(variables.ticketId))?.key?.toUpperCase();
      invalidateTicketCaches(queryClient, variables.ticketId, resolvedProjectId, resolvedTicketKey);
    },
  });

  const assignLabelToTicket = useCallback(async (ticketId: string, labelId: string) => {
    try {
      await assignLabelMutation.mutateAsync({ ticketId, labelId });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, [assignLabelMutation]);

  const unassignLabelMutation = useMutation({
    mutationFn: async ({ ticketId, labelId }: { ticketId: string; labelId: string }) => {
      await apiClient.delete(`/tickets/${ticketId}/labels/${labelId}`);
    },
    onMutate: ({ ticketId, labelId }) => {
      handleTicketLabelUpdate(ticketId, labelId, false);
      return { ticketId, labelId, projectId: resolveTicketProjectId(ticketId) };
    },
    onError: (error, variables) => {
      handleTicketLabelUpdate(variables.ticketId, variables.labelId, true);
      showLabelMutationError(error, 'unassign');
      const resolvedProjectId = resolveTicketProjectId(variables.ticketId) || undefined;
      const resolvedTicketKey = queryClient.getQueryData<Ticket>(queryKeys.ticketDetail(variables.ticketId))?.key?.toUpperCase();
      invalidateTicketCaches(queryClient, variables.ticketId, resolvedProjectId, resolvedTicketKey);
    },
    onSuccess: (_result, variables) => {
      const resolvedProjectId = resolveTicketProjectId(variables.ticketId) || undefined;
      const resolvedTicketKey = queryClient.getQueryData<Ticket>(queryKeys.ticketDetail(variables.ticketId))?.key?.toUpperCase();
      invalidateTicketCaches(queryClient, variables.ticketId, resolvedProjectId, resolvedTicketKey);
    },
  });

  const unassignLabelFromTicket = useCallback(async (ticketId: string, labelId: string) => {
    try {
      await unassignLabelMutation.mutateAsync({ ticketId, labelId });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, [unassignLabelMutation]);

  const labelsByProject = useMemo(() => {
    const map = new Map<string, Label[]>();
    for (const label of labels) {
      if (!label.projectId) {
        continue;
      }

      const current = map.get(label.projectId);
      if (current) {
        current.push(label);
      } else {
        map.set(label.projectId, [label]);
      }
    }
    return map;
  }, [labels]);

  const globalLabels = useMemo(() => labels.filter((label) => !label.projectId), [labels]);

  const value = useMemo<LabelContextType>(() => ({
    labels,
    labelsByProject,
    globalLabels,
    createLabel,
    updateLabel,
    deleteLabel,
    assignLabelToTicket,
    unassignLabelFromTicket,
    findLabelQueryKey,
    invalidateLabelQueries,
  }), [
    labels,
    labelsByProject,
    globalLabels,
    createLabel,
    updateLabel,
    deleteLabel,
    assignLabelToTicket,
    unassignLabelFromTicket,
    findLabelQueryKey,
    invalidateLabelQueries,
  ]);

  return (
    <LabelContext.Provider value={value}>
      {children}
    </LabelContext.Provider>
  );
};
