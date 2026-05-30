import { describe, it, expect } from 'vitest';
import { canonicalizeStatus } from '../../src/modules/tickets/services/tickets';

describe('canonicalizeStatus', () => {
  it('normalizes various inputs to canonical values', () => {
    expect(canonicalizeStatus('Todo')).toBe('todo');
    expect(canonicalizeStatus('TO DO')).toBe('todo');
    expect(canonicalizeStatus('In Progress')).toBe('in_progress');
    expect(canonicalizeStatus('in_progress')).toBe('in_progress');
    expect(canonicalizeStatus('InReview')).toBe('in_review');
    expect(canonicalizeStatus('Cancelled')).toBe('canceled');
    expect(canonicalizeStatus('Canceled')).toBe('canceled');
    expect(canonicalizeStatus('Done')).toBe('done');
    expect(canonicalizeStatus(null)).toBe('todo');
    expect(canonicalizeStatus(undefined)).toBe('todo');
    expect(canonicalizeStatus('unexpected-status')).toBe('todo');
  });
});
