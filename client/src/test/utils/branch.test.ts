import { describe, it, expect } from 'vitest';
import { generateBranchName } from '../../utils/branch';

describe('generateBranchName', () => {
  it('generates a slugified branch name from key and title', () => {
    const result = generateBranchName('GRA-123', 'Fix sync retries');
    expect(result).toBe('feature/gra-123-fix-sync-retries');
  });

  it('falls back when title produces empty slug', () => {
    const result = generateBranchName('GRA-123', '***');
    expect(result).toBe('feature/gra-123-update-ticket');
  });

  it('truncates long titles to reasonable length', () => {
    const long = 'This is a very long title with many words and punctuation that should be truncated when creating a branch name';
    const result = generateBranchName('GRA-123', long);
    expect(result.startsWith('feature/gra-123-')).toBe(true);
    // slug portion should be <= 48 chars
    const slug = result.replace(/^feature\/gra-123-/, '');
    expect(slug.length).toBeLessThanOrEqual(48);
  });

  it('handles unicode characters by producing an ascii-safe slug', () => {
    const result = generateBranchName('GRA-123', 'Résumé — fix');
    const slug = result.replace(/^feature\/gra-123-/, '');
    // slug should only contain lowercase ascii letters, numbers and hyphens
    expect(/^[a-z0-9-]+$/.test(slug)).toBe(true);
  });

  it('removes branch-breaking punctuation characters before slugification', () => {
    const title = '#*`~>[ ]{}()feature_update';
    const result = generateBranchName('GRA-123', title);
    expect(result).toBe('feature/gra-123-feature-update');
  });

  it('does not cut words when truncating long titles', () => {
    const long = 'fix crash when opening very long tickets in details view with extra context data';
    const result = generateBranchName('GRA-123', long);
    const slug = result.replace(/^feature\/gra-123-/, '');

    expect(slug).toBe('fix-crash-when-opening-very-long-tickets-in');
  });

  it('normalizes ticket keys into branch-safe slugs', () => {
    const result = generateBranchName('GR_A / 123', 'Fix sync retries');
    expect(result).toBe('feature/gr-a-123-fix-sync-retries');
  });

  it('truncates long ticket keys to keep branch names bounded', () => {
    const result = generateBranchName('very-long-ticket-key-with-extra-characters-12345', 'Fix sync retries');
    const ticketPortion = result.replace(/^feature\//, '').replace(/-fix-sync-retries$/, '');
    expect(ticketPortion.length).toBe(24);
  });

  it('does not keep trailing separators when truncating long ticket keys', () => {
    const result = generateBranchName('a-a-a-a-a-a-a-a-a-a-a-a-a-a-a-x', 'Fix sync retries');
    const ticketPortion = result.replace(/^feature\//, '').replace(/-fix-sync-retries$/, '');

    expect(ticketPortion.endsWith('-')).toBe(false);
    expect(ticketPortion.startsWith('-')).toBe(false);
  });

  it('uses a deterministic fallback key for invalid ticket keys', () => {
    const invalidKey = '***';
    const result = generateBranchName(invalidKey, 'Fix sync retries');
    const ticketPrefix = result.replace(/^feature\//, '').split('-').slice(0, 2).join('-');
    const full = result.replace(/^feature\//, '');
    expect(ticketPrefix.startsWith('ticket-')).toBe(true);
    expect(/^ticket-[a-z0-9]+-fix-sync-retries$/.test(full)).toBe(true);
  });

  it('uses different fallback keys for different invalid ticket keys', () => {
    const first = generateBranchName('***', 'Fix sync retries');
    const second = generateBranchName('@@@', 'Fix sync retries');
    expect(first).not.toBe(second);
  });

  it('truncates to the last complete word before the limit', () => {
    const long = `bug ${'a'.repeat(120)}`;
    const result = generateBranchName('GRA-123', long);
    const slug = result.replace(/^feature\/gra-123-/, '');

    expect(slug).toBe('bug');
  });

  it('hard-cuts when no word boundary is available', () => {
    const long = 'a'.repeat(120);
    const result = generateBranchName('GRA-123', long);
    const slug = result.replace(/^feature\/gra-123-/, '');

    expect(slug).toBe('a'.repeat(48));
  });
});
