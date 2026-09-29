import { z } from 'zod';

export class ReconciliationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export const scanSchema = z.object({
  startPage: z.number().int().min(1).max(1000).default(1),
  maxPages: z.number().int().min(1).max(5).default(5),
});
export const credentialSchema = z.string().trim().max(255).refine(
  value => !value || /^(github_pat_|ghs_)[A-Za-z0-9_]+$/.test(value),
  'Use a fine-grained PAT or installation token with only Pull requests: read for the linked repository.',
).optional();
export type Scan = z.infer<typeof scanSchema>;
export type PullRequest = {
  number: number; url: string; title: string; branch: string;
  state: 'open' | 'closed'; mergedAt: string | null; updatedAt: string;
};

export function repositoryName(url: string): string {
  // Do not let a linked URL control the API host, credentials, query or redirects.
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)\/?$/.exec(url);
  if (!match || match[2] === '.' || match[2] === '..') {
    throw new ReconciliationError('Link a GitHub repository using https://github.com/owner/repo first.');
  }
  const repo = match[2].replace(/\.git$/i, '');
  if (!repo || repo === '.' || repo === '..') throw new ReconciliationError('Invalid GitHub repository name.');
  return `${match[1]}/${repo}`.toLowerCase();
}

const githubPullSchema = z.object({
  number: z.number().int().positive(), title: z.string().max(1000),
  head: z.object({ ref: z.string().max(1000) }),
  state: z.enum(['open', 'closed']),
  merged_at: z.string().datetime({ offset: true }).nullable(),
  updated_at: z.string().datetime({ offset: true }),
});

export async function fetchPullRequests(repo: string, scan: Scan, credential?: string) {
  const pulls = new Map<number, PullRequest>();
  let hasMore = false;
  let pagesFetched = 0;
  // One deadline covers the entire scan, including response bodies.
  const signal = AbortSignal.timeout(30_000);
  try {
    for (let page = scan.startPage; page < scan.startPage + scan.maxPages; page++) {
      const response = await fetch(`https://api.github.com/repos/${repo}/pulls?state=all&sort=created&direction=desc&per_page=100&page=${page}`, {
        method: 'GET', redirect: 'error', signal,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
        },
      });
      if (!response.ok) {
        // Never return GitHub response bodies, which can contain credential/account details.
        if (response.status === 403 || response.status === 429) throw new ReconciliationError('GitHub denied access or rate limited this scan. Check repository read permission and retry later.', 503);
        if (response.status === 401 || response.status === 404) throw new ReconciliationError('GitHub repository unavailable. Check the linked repository and read-only credential.', 422);
        throw new ReconciliationError('GitHub could not complete the scan. No changes were applied.', 502);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing GitHub response body');
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 10 * 1024 * 1024) { await reader.cancel(); throw new Error('GitHub page too large'); }
        chunks.push(value);
      }
      const body = z.array(githubPullSchema).max(100).parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      for (const pr of body) {
        pulls.set(pr.number, {
          number: pr.number, url: `https://github.com/${repo}/pull/${pr.number}`,
          title: pr.title, branch: pr.head.ref, state: pr.state,
          mergedAt: pr.state === 'closed' ? pr.merged_at : null, updatedAt: pr.updated_at,
        });
      }
      pagesFetched++;
      hasMore = /rel="next"/.test(response.headers.get('link') ?? '');
      if (!hasMore) break;
    }
  } catch (error) {
    if (error instanceof ReconciliationError) throw error;
    throw new ReconciliationError('GitHub scan failed or timed out. No changes were applied; retry the preview.', 502);
  }
  return { pulls: [...pulls.values()], pagesFetched, nextPage: hasMore && scan.startPage + pagesFetched <= 1000 ? scan.startPage + pagesFetched : null,
    incomplete: scan.startPage > 1 || hasMore };
}
