export function generateBranchName(ticketKey: string, title: string): string {
  const maxTicketKeyLength = 24;
  const maxSlugLength = 48;
  const safeTicketKey = sanitizeTicketKey(ticketKey, maxTicketKeyLength);
  const slug = trimBoundaryChars(
    (title || '')
    .toLowerCase()
    // Remove characters that commonly break branch names, then normalize separators.
    .replace(/[#*_`~>[\]{}()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
  );

  const truncatedSlug = slug.length > maxSlugLength ? slug.slice(0, maxSlugLength) : slug;
  const lastWordBoundary = truncatedSlug.lastIndexOf('-');
  // If there is no word boundary in the truncated slug, keep a hard cut.
  // This handles single-token titles and avoids creating empty slugs.
  const boundedSlug =
    slug.length > maxSlugLength && lastWordBoundary > 0
      ? truncatedSlug.slice(0, lastWordBoundary)
      : truncatedSlug;

  return `feature/${safeTicketKey}-${(boundedSlug || 'update-ticket')}`.toLowerCase();
}

function sanitizeTicketKey(ticketKey: string, maxLength: number): string {
  const normalized = trimBoundaryChars(
    (ticketKey || '')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
  );

  if (normalized.length > 0) {
    const bounded = trimBoundaryChars(normalized.slice(0, maxLength));
    if (bounded.length > 0) {
      return bounded;
    }
  }

  const fallback = `ticket-${hashForSlugSeed(ticketKey)}`;
  return trimBoundaryChars(fallback.slice(0, maxLength));
}

const boundaryTrimPattern = /^-+|-+$/g;

function trimBoundaryChars(value: string): string {
  return value.replace(boundaryTrimPattern, '');
}

function hashForSlugSeed(value: string): string {
  const normalized = (value || '').normalize('NFKD');
  let primary = 2166136261 >>> 0;
  let secondary = 2166136261 >>> 0;
  let tertiary = 374761393 >>> 0;

  for (let i = 0; i < normalized.length; i++) {
    const charCode = normalized.charCodeAt(i);

    primary ^= charCode;
    primary = Math.imul(primary, 16777619) >>> 0;

    secondary ^= charCode + i;
    secondary = Math.imul(secondary, 374761393) >>> 0;

    tertiary ^= (charCode << 1) + (charCode << 7);
    tertiary = Math.imul(tertiary, 668265263) >>> 0;
  }

  return `${primary.toString(36)}${secondary.toString(36)}${tertiary.toString(36)}`;
}

export default generateBranchName;
