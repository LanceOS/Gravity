import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { TicketFiltersProvider, useTicketFilters } from '../TicketFiltersContext';
import { initialFilters } from '../../shared/filters';
import { useActiveProject } from '../../project/ActiveProjectContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../project/ActiveProjectContext', () => ({
  useActiveProject: vi.fn(),
}));

describe('TicketFiltersContext', () => {
  const mockActiveProjectId = 'project-123';
  let activeProjectIdRef = { current: mockActiveProjectId };

  beforeEach(() => {
    activeProjectIdRef = { current: mockActiveProjectId };
    (useActiveProject as any).mockReturnValue({
      activeProjectId: mockActiveProjectId,
      activeProjectIdRef,
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <TicketFiltersProvider>{children}</TicketFiltersProvider>
  );

  it('should initialize with default filters and sync active project', () => {
    const { result } = renderHook(() => useTicketFilters(), { wrapper });
    expect(result.current.filters).toEqual({ ...initialFilters, projectId: mockActiveProjectId });
  });

  it('should patch filters correctly', () => {
    const { result } = renderHook(() => useTicketFilters(), { wrapper });

    act(() => {
      result.current.setFilters({ status: 'done', priority: 'high' });
    });

    expect(result.current.filters.status).toBe('done');
    expect(result.current.filters.priority).toBe('high');
    expect(result.current.filters.projectId).toBe(mockActiveProjectId);
  });

  it('should maintain stable object reference if no actual changes', () => {
    const { result } = renderHook(() => useTicketFilters(), { wrapper });
    
    act(() => {
      result.current.setFilters({ status: 'done' });
    });

    const filtersBefore = result.current.filters;

    act(() => {
      result.current.setFilters({ status: 'done' });
    });

    const filtersAfter = result.current.filters;
    expect(filtersAfter).toBe(filtersBefore);
  });

  it('should reset filters while preserving project id reference', () => {
    const { result } = renderHook(() => useTicketFilters(), { wrapper });

    act(() => {
      result.current.setFilters({ status: 'done', search: 'bug' });
    });

    expect(result.current.filters.status).toBe('done');

    activeProjectIdRef.current = 'project-456';
    (useActiveProject as any).mockReturnValue({
      activeProjectId: 'project-456',
      activeProjectIdRef,
    });

    // Re-render to propagate the mock change before we reset
    result.current.setFilters({ search: 'bug' }); // force re-render

    act(() => {
      result.current.resetFilters();
    });

    expect(result.current.filters).toEqual({ ...initialFilters, projectId: 'project-456' });
  });

  it('should throw error if used outside provider', () => {
    const consoleError = console.error;
    console.error = vi.fn();

    expect(() => {
      renderHook(() => useTicketFilters());
    }).toThrow('useTicketFilters must be used within a TicketFiltersProvider');

    console.error = consoleError;
  });
});
