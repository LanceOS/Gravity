export function normalizeSearchTerm(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeSearchToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function buildSearchableText(parts: ReadonlyArray<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .toLowerCase();
}
