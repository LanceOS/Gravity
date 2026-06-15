import { useCallback } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';

import type { TicketFilters } from '../../../tickets';

interface UseWorkspaceShellFiltersArgs {
  filters: TicketFilters;
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
}

interface UseWorkspaceShellFiltersResult {
  handleSetFilters: (updates: Partial<TicketFilters>) => void;
}

export function useWorkspaceShellFilters({
  filters,
  searchParams,
  setSearchParams,
}: UseWorkspaceShellFiltersArgs): UseWorkspaceShellFiltersResult {
  const handleSetFilters = useCallback(
    (updates: Partial<TicketFilters>) => {
      const nextParams = new URLSearchParams(searchParams);
      const merged = { ...filters, ...updates };

      if (merged.labels && merged.labels.length > 0) {
        nextParams.set('labels', merged.labels.join(','));
      } else {
        nextParams.delete('labels');
      }

      if (merged.labelMode && merged.labelMode !== 'any') {
        nextParams.set('labelMode', merged.labelMode);
      } else {
        nextParams.delete('labelMode');
      }

      if (merged.cycleId) {
        nextParams.set('cycleId', merged.cycleId);
      } else {
        nextParams.delete('cycleId');
      }

      if (merged.labelId) {
        nextParams.set('labelId', merged.labelId);
      } else {
        nextParams.delete('labelId');
      }

      nextParams.delete('domainId');

      if (merged.assigneeId) {
        nextParams.set('assigneeId', merged.assigneeId);
      } else {
        nextParams.delete('assigneeId');
      }

      if (merged.status) {
        nextParams.set('status', merged.status);
      } else {
        nextParams.delete('status');
      }

      if (merged.priority) {
        nextParams.set('priority', merged.priority);
      } else {
        nextParams.delete('priority');
      }

      if (merged.search) {
        nextParams.set('q', merged.search);
      } else {
        nextParams.delete('q');
      }

      const isOnlySearchUpdate = Object.keys(updates).length === 1 && 'search' in updates;
      setSearchParams(nextParams, { replace: isOnlySearchUpdate });
    },
    [filters, searchParams, setSearchParams]
  );

  return { handleSetFilters };
}
