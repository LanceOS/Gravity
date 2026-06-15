export interface GithubRepoValidationResult {
  url: string | null;
  error: string | null;
}

export function sanitizeProjectKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export function validateGithubRepoUrl(value: string): GithubRepoValidationResult {
  const trimmedUrl = value.trim();

  if (!trimmedUrl) {
    return { url: null, error: null };
  }

  try {
    const parsed = new URL(trimmedUrl);
    const pathParts = parsed.pathname.split('/').filter(Boolean);

    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || pathParts.length < 2) {
      return {
        url: null,
        error: 'URL must be a valid GitHub repository URL (e.g. https://github.com/owner/repo).',
      };
    }

    return { url: trimmedUrl, error: null };
  } catch {
    return {
      url: null,
      error: 'Please enter a valid URL (e.g. https://github.com/owner/repo).',
    };
  }
}

