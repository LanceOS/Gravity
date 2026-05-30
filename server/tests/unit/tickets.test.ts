import { describe, it, expect } from 'vitest';
import { canonicalizeStatus, canonicalizePriority, canonicalizePrStatus, sanitizeTitle, canonicalizeBranchName } from '../../src/modules/tickets/services/tickets';

describe('canonicalization helpers', () => {
  it('canonicalizeStatus normalizes various inputs to canonical values', () => {
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

  it('canonicalizePriority normalizes priority inputs', () => {
    expect(canonicalizePriority('High')).toBe('high');
    expect(canonicalizePriority('urgent')).toBe('urgent');
    expect(canonicalizePriority('NO PRIORITY')).toBe('no_priority');
    expect(canonicalizePriority(null)).toBe('no_priority');
    expect(canonicalizePriority('weird-value')).toBe('no_priority');
  });

  it('canonicalizePrStatus normalizes PR status inputs', () => {
    expect(canonicalizePrStatus('open')).toBe('open');
    expect(canonicalizePrStatus('Merged')).toBe('merged');
    expect(canonicalizePrStatus('CLOSED')).toBe('closed');
    expect(canonicalizePrStatus(null)).toBe('none');
    expect(canonicalizePrStatus('something-else')).toBe('none');
  });

  it('sanitizeTitle collapses whitespace and trims', () => {
    expect(sanitizeTitle('  Hello   World  ')).toBe('Hello World');
    expect(sanitizeTitle('\n\tTitle\u0000')).toBe('Title');
  });

  it('canonicalizeBranchName normalizes branch names', () => {
    expect(canonicalizeBranchName('Feature/ABC-1 My Feature')).toBe('feature/abc-1-my-feature');
    expect(canonicalizeBranchName('  BUGFIX\t/FOO__bar ')).toBe('bugfix/foo__bar');
  });
});
