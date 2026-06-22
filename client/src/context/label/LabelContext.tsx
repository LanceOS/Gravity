import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../utils/apiClient';
import { queryKeys, CACHE_CONFIGS } from '../../utils/queryClient';
import { useActiveProject } from '../project/ActiveProjectContext';
import { useAuth } from '../auth/AuthContext';
import { patchTicketLabelAssignment, patchTicketInAllCaches, invalidateTicketCaches } from '../shared';
import { toast } from '@library';
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

  const labelsQuery = useQuery({
    queryKey: queryKeys.labels(activeProjectId),
    queryFn: () => apiClient.get<Label[]>(`/labels`, {
      params: { projectId: activeProjectId },
      projectId: activeProjectId,
    }),
    enabled: !!activeProjectId && !!currentUser,
    ...CACHE_CONFIGS.metadata,
  });

  const labels = labelsQuery.data || [];

  const findLabelQueryKey = useCallback(
    (labelId: string) => {
      const labelQueries = queryClient.getQueriesData<Label[]>({ queryKey: ['labels'] }) || [];
      const teamLabelQueries = queryClient.getQueriesData<Label[]>({ queryKey: ['teamLabels'] }) || [];
      const cachedLabelQueries = [...labelQueries, ...teamLabelQueries];

      for (const [queryKey, cachedLabels] of cachedLabelQueries) {
        if (Array.isArray(cachedLabels) && cachedLabels.some((label) => label.id === labelId)) {
          return queryKey;
        }
      }

      return null;
    },
    [queryClient]
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

  const handleTicketLabelUpdate = useCallback((ticketId: string, labelId: string, isAssigned: boolean) => {
    const label = labels.find((entry) => entry.id === labelId);
    patchTicketInAllCaches(queryClient, ticketId, (ticket) => 
      patchTicketLabelAssignment(ticket, labelId, isAssigned, label)
    );
  }, [labels, queryClient]);

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
      const cachedLabel = labels.find((label) => label.id === id);
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
      const cachedLabel = labels.find((label) => label.id === id);
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
      return { ticketId, labelId };
    },
    onError: (error, variables) => {
      handleTicketLabelUpdate(variables.ticketId, variables.labelId, false);
      showLabelMutationError(error, 'assign');
      invalidateTicketCaches(queryClient, variables.ticketId);
    },
    onSuccess: (_result, variables) => {
      invalidateTicketCaches(queryClient, variables.ticketId);
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
      return { ticketId, labelId };
    },
    onError: (error, variables) => {
      handleTicketLabelUpdate(variables.ticketId, variables.labelId, true);
      showLabelMutationError(error, 'unassign');
      invalidateTicketCaches(queryClient, variables.ticketId);
    },
    onSuccess: (_result, variables) => {
      invalidateTicketCaches(queryClient, variables.ticketId);
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
