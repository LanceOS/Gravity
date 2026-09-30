export class InvalidProjectKeyError extends Error {
  constructor() {
    super('Project key must be a nonempty string containing only letters (A-Z) and digits (0-9), with no control characters. Surrounding spaces are allowed.');
    this.name = 'InvalidProjectKeyError';
  }
}

// Only new project prefixes use this policy. Never rewrite historical identities.
export function normalizeProjectKey(value: unknown): string {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    throw new InvalidProjectKeyError();
  }

  const trimmed = value.trim();
  // Validate before case folding too: Unicode letters can uppercase to ASCII.
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) {
    throw new InvalidProjectKeyError();
  }
  return trimmed.toUpperCase();
}
