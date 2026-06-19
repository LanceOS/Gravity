import { describe, expect, it } from 'vitest';
import { initialFilters, resetFilters, type TicketFiltersState } from '../../../context/shared/filters';

describe('initialFilters', () => {
  it('has all required keys', () => {
    const keys: Array<keyof TicketFiltersState> = [
      'status',
      'priority',
      'projectId',
      'labelId',
      'labels',
      'labelMode',
      'cycleId',
      'assigneeId',
      'search',
    ];

    for (const key of keys) {
      expect(key in initialFilters).toBe(true);
    }
  });

  it('has empty string defaults for string fields', () => {
    expect(initialFilters.status).toBe('');
    expect(initialFilters.priority).toBe('');
    expect(initialFilters.projectId).toBe('');
    expect(initialFilters.labelId).toBe('');
    expect(initialFilters.cycleId).toBe('');
    expect(initialFilters.assigneeId).toBe('');
    expect(initialFilters.search).toBe('');
  });

  it('has an empty array for labels', () => {
    expect(Array.isArray(initialFilters.labels)).toBe(true);
    expect(initialFilters.labels).toHaveLength(0);
  });

  it('defaults labelMode to "any"', () => {
    expect(initialFilters.labelMode).toBe('any');
  });
});

describe('resetFilters', () => {
  it('returns an object equal to initialFilters', () => {
    const reset = resetFilters();
    expect(reset).toEqual(initialFilters);
  });

  it('returns a new object reference each call', () => {
    const first = resetFilters();
    const second = resetFilters();
    expect(first).not.toBe(second);
  });

  it('returns a new labels array reference each call', () => {
    const first = resetFilters();
    const second = resetFilters();
    expect(first.labels).not.toBe(second.labels);
  });

  it('mutating the returned object does not affect subsequent calls', () => {
    const first = resetFilters();
    first.search = 'mutated';
    first.labels.push('label-1');

    const second = resetFilters();
    expect(second.search).toBe('');
    expect(second.labels).toHaveLength(0);
  });

  it('mutating the returned object does not affect initialFilters', () => {
    const reset = resetFilters();
    reset.status = 'done';
    reset.labels.push('something');

    expect(initialFilters.status).toBe('');
    expect(initialFilters.labels).toHaveLength(0);
  });
});
