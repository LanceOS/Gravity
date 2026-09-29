import { describe, it, expect, vi } from 'vitest';
import { buildCandidates, digest, readPlan, signPlan, type Plan } from '../src/modules/github-reconciliation/preview.js';
import { credentialSchema, fetchPullRequests, repositoryName, scanSchema, type PullRequest } from '../src/modules/github-reconciliation/github.js';
import type { tickets } from '../src/db/schema.js';

const ticket = (overrides: Partial<typeof tickets.$inferSelect> = {}): typeof tickets.$inferSelect => ({
  id: 'ticket-1', key: 'GRAV-1', title: 'Recover missing ticket updates', description: '', status: 'in_progress',
  priority: 'medium', assigneeId: null, projectId: 'project-1', cycleId: null, parentId: null,
  prStatus: 'none', prUrl: null, branchName: 'feature/recover-ticket',
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), ...overrides,
});
const pull = (overrides: Partial<PullRequest> = {}): PullRequest => ({
  number: 1, url: 'https://github.com/owner/repo/pull/1', title: 'GRAV-1 recover updates', branch: 'feature/one',
  state: 'closed', mergedAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', ...overrides,
});
const apiPull = (number = 1) => ({ number, title: 'GRAV-1 recover updates', head: { ref: 'feature/one' },
  state: 'closed', merged_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' });

describe('GitHub reconciliation evidence', () => {
  it('matches key boundaries, exact branches and existing links', () => {
    expect(buildCandidates([ticket()], [pull()], false)[0]).toMatchObject({ confidence: 'explicit', protected: false, requiresReview: false });
    expect(buildCandidates([ticket()], [pull({ title: 'NOTGRAV-1 GRAV-10 GRAV-1suffix', branch: 'xGRAV-1' })], false)).toEqual([]);
    expect(buildCandidates([ticket()], [pull({ title: 'different', branch: 'feature/recover-ticket' })], false)[0].evidence).toEqual(['Exact ticket branch']);
    expect(buildCandidates([ticket({ prUrl: pull().url })], [pull({ title: 'different' })], false)[0].evidence).toEqual(['Existing ticket PR link']);
    expect(buildCandidates([ticket()], [pull({ title: 'different', branch: 'fix/grav-1-fix' })], false)[0].confidence).toBe('explicit');
  });
  it('requires review for title similarity, multiple PRs, and partial scans', () => {
    expect(buildCandidates([ticket()], [pull({ title: 'Recover missing ticket updates' })], false)[0]).toMatchObject({ confidence: 'suggested', requiresReview: true });
    const multi = buildCandidates([ticket()], [pull(), pull({ number: 2, state: 'open', mergedAt: null })], false);
    expect(multi).toHaveLength(2);
    expect(multi[0].requiresReview).toBe(true);
    expect(multi[1].protected).toBe(true);
    expect(buildCandidates([ticket()], [pull()], true)[0].requiresReview).toBe(true);
  });
  it.each([
    { status: 'canceled' }, { prUrl: 'https://github.com/owner/repo/pull/2' },
    { prStatus: 'merged', status: 'in_progress' }, { updatedAt: new Date('2026-01-03') },
  ])('preserves manual decisions %j', overrides => {
    const [candidate] = buildCandidates([ticket(overrides)], [pull()], false);
    expect(candidate.protected).toBe(true);
    expect(candidate.conflicts.length).toBeGreaterThan(0);
  });
  it('surfaces tracked open PR conflicts even outside scanned match evidence', () => {
    const [candidate] = buildCandidates([ticket()], [pull()], false, [{ ticketId: 'ticket-1', prUrl: 'https://github.com/owner/repo/pull/99', status: 'open' }]);
    expect(candidate.protected).toBe(true);
    expect(candidate.conflicts).toContain('Another tracked PR is open: unresolved work preserved');
  });
  it('treats equivalent GitHub PR URL casing and trailing slashes as the same identity', () => {
    const legacy = ticket({ prUrl: 'https://github.com/OWNER/Repo/pull/1/', prStatus: 'open' });
    const [candidate] = buildCandidates([legacy], [pull({ title: 'Different title' })], false,
      [{ ticketId: legacy.id, prUrl: legacy.prUrl!, status: 'open' }]);
    expect(candidate).toMatchObject({ protected: false, evidence: ['Existing ticket PR link'] });
    const [synced] = buildCandidates([{ ...legacy, status: 'done', prStatus: 'merged', updatedAt: new Date('2026-01-03') }], [pull()], false);
    expect(synced.noChange).toBe(true);
  });
  it('bounds candidate expansion', () => {
    const rows = Array.from({ length: 501 }, (_, index) => ticket({ id: `t${index}` }));
    expect(() => buildCandidates(rows, [pull()], false)).toThrow('More than 500 matches');
  });
  it('recognizes already-synchronized tickets without treating the reconciliation edit as an override', () => {
    const [candidate] = buildCandidates([ticket({ status: 'done', prStatus: 'merged', prUrl: pull().url, updatedAt: new Date('2026-01-03') })], [pull()], false);
    expect(candidate).toMatchObject({ noChange: true, protected: false });
  });
  it('binds signed previews to actor/project, detects tampering and expiry', () => {
    const plan: Plan = { version: 1, actorId: 'actor', projectId: 'project-1', repo: 'owner/repo', expiresAt: Date.now() + 60_000,
      scan: { startPage: 1, maxPages: 5 }, pullsDigest: digest([pull()]), candidates: buildCandidates([ticket()], [pull()], false) };
    const token = signPlan(plan);
    expect(readPlan(token, 'actor', 'project-1')).toEqual(plan);
    expect(() => readPlan(token, 'other', 'project-1')).toThrow('Preview expired or invalid');
    expect(() => readPlan(token, 'actor', 'other')).toThrow();
    expect(() => readPlan(`x${token}`, 'actor', 'project-1')).toThrow();
    expect(() => readPlan(signPlan({ ...plan, expiresAt: Date.now() - 1 }), 'actor', 'project-1')).toThrow();
  });
});

describe('bounded read-only GitHub scan', () => {
  it('accepts only linked GitHub repository paths and least-privilege token types', () => {
    expect(repositoryName('https://github.com/Owner/repo.git/')).toBe('owner/repo');
    for (const value of ['https://github.com/owner/repo/pulls', 'https://evil.test/owner/repo', 'https://github.com@evil.test/owner/repo', 'https://github.com/owner/repo?x=y', 'https://github.com/owner/..']) {
      expect(() => repositoryName(value)).toThrow();
    }
    expect(credentialSchema.parse('github_pat_readonly')).toBe('github_pat_readonly');
    expect(credentialSchema.parse('ghs_installation')).toBe('ghs_installation');
    expect(() => credentialSchema.parse('ghp_classic')).toThrow();
    expect(() => scanSchema.parse({ startPage: 0 })).toThrow();
    expect(() => scanSchema.parse({ maxPages: 6 })).toThrow();
  });
  it('bounds requests, ignores untrusted next URLs, uses only GET and reports partial coverage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([apiPull()]), { headers: { link: '<https://evil.test/token>; rel="next"' } }));
    // Each response body must be independently consumable.
    fetchMock.mockImplementation(async () => new Response(JSON.stringify([apiPull()]), { headers: { link: '<https://evil.test/token>; rel="next"' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchPullRequests('owner/repo', { startPage: 3, maxPages: 2 }, 'github_pat_readonly');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      'https://api.github.com/repos/owner/repo/pulls?state=all&sort=created&direction=desc&per_page=100&page=3',
      'https://api.github.com/repos/owner/repo/pulls?state=all&sort=created&direction=desc&per_page=100&page=4',
    ]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'error', headers: { Authorization: 'Bearer github_pat_readonly' } });
    expect(result).toMatchObject({ pagesFetched: 2, nextPage: 5, incomplete: true });
    expect(result.pulls).toHaveLength(1);
  });
  it('stops at the final page and supports anonymous public reads', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([apiPull()])));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchPullRequests('owner/repo', { startPage: 1, maxPages: 5 })).toMatchObject({ pagesFetched: 1, incomplete: false, nextPage: null });
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });
  it.each([401, 403, 404, 429, 500])('returns sanitized failures for GitHub status %s', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('secret credential detail', { status })));
    await expect(fetchPullRequests('owner/repo', { startPage: 1, maxPages: 5 })).rejects.not.toThrow('secret');
  });
  it('fails closed on incomplete or invalid GitHub state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ ...apiPull(), merged_at: undefined }]))));
    await expect(fetchPullRequests('owner/repo', { startPage: 1, maxPages: 1 })).rejects.toThrow('scan failed');
  });
});
