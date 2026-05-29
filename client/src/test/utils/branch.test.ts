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
});
