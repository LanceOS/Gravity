import { createHash, randomUUID } from 'node:crypto';
import { normalizeFederationPublicKey } from '../../lib/http-signatures.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function asNullableString(value: unknown) {
  return typeof value === 'string' ? value : value === null ? null : undefined;
}

export function parseFederationDate(value: unknown, fallback = new Date()) {
  const parsed = typeof value === 'string' || value instanceof Date ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function createInviteToken() {
  return `fed_${randomUUID().replace(/-/g, '')}`;
}

export function createFederatedAuthorId(publicKey: string) {
  return `fedusr-${createHash('sha256').update(normalizeFederationPublicKey(publicKey)).digest('hex').slice(0, 24)}`;
}

export function createFederatedAuthorEmail(userId: string) {
  return `${userId}@gravity.invalid`;
}

export function createFederatedAuthorAvatar(seed: string) {
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
}
