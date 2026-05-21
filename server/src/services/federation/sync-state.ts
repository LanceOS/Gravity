import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { peerConnections } from '../../db/schema.js';
import { env } from '../../env.js';
import type { FederationSyncConnectionState, FederationSyncStateSeed } from './types.js';

// Strategy Pattern for retry backoffs
export interface BackoffPolicy {
  computeDelay(failureCount: number): number;
}

export class ExponentialBackoffPolicy implements BackoffPolicy {
  constructor(
    private baseMs: number,
    private maxMs: number
  ) {}

  computeDelay(failureCount: number): number {
    const exponent = Math.max(0, failureCount - 1);
    return Math.min(this.baseMs * 2 ** exponent, this.maxMs);
  }
}

export const defaultBackoffPolicy: BackoffPolicy = new ExponentialBackoffPolicy(
  env.federationSyncFailureBaseMs,
  env.federationSyncFailureMaxMs
);

export const federationSyncStates = new Map<string, FederationSyncConnectionState>();

export function getFederationSyncState(connectionId: string, seed?: FederationSyncStateSeed) {
  const existing = federationSyncStates.get(connectionId);
  if (existing) {
    return existing;
  }

  const state: FederationSyncConnectionState = {
    consecutiveFailures: seed?.consecutiveFailures ?? 0,
    nextAttemptAtMs: seed?.nextAttemptAt ? seed.nextAttemptAt.getTime() : 0,
    lastAttemptAtMs: seed?.lastAttemptAt ? seed.lastAttemptAt.getTime() : null,
    lastSuccessAtMs: seed?.lastSuccessAt ? seed.lastSuccessAt.getTime() : null,
    lastError: seed?.lastError ?? null,
    lastAppliedCount: seed?.lastAppliedCount ?? 0,
  };
  federationSyncStates.set(connectionId, state);
  return state;
}

export function mapFederationSyncStateToRecord(state: FederationSyncConnectionState) {
  return {
    consecutiveFailures: state.consecutiveFailures,
    nextAttemptAt: state.nextAttemptAtMs > 0 ? new Date(state.nextAttemptAtMs) : null,
    lastAttemptAt: state.lastAttemptAtMs ? new Date(state.lastAttemptAtMs) : null,
    lastSuccessAt: state.lastSuccessAtMs ? new Date(state.lastSuccessAtMs) : null,
    lastError: state.lastError,
    lastAppliedCount: state.lastAppliedCount,
  };
}

export async function persistFederationSyncState(connectionId: string, status: string, state: FederationSyncConnectionState) {
  await db
    .update(peerConnections)
    .set({
      status,
      ...mapFederationSyncStateToRecord(state),
    })
    .where(eq(peerConnections.id, connectionId));
}

export async function recordFederationSyncFailure(connectionId: string, errorMessage: string) {
  const rows = await db
    .select({
      status: peerConnections.status,
      consecutiveFailures: peerConnections.consecutiveFailures,
      nextAttemptAt: peerConnections.nextAttemptAt,
      lastAttemptAt: peerConnections.lastAttemptAt,
      lastSuccessAt: peerConnections.lastSuccessAt,
      lastError: peerConnections.lastError,
      lastAppliedCount: peerConnections.lastAppliedCount,
    })
    .from(peerConnections)
    .where(eq(peerConnections.id, connectionId))
    .limit(1);

  const connection = rows[0];
  if (!connection) {
    return null;
  }

  const syncState = getFederationSyncState(connectionId, {
    consecutiveFailures: connection.consecutiveFailures,
    nextAttemptAt: connection.nextAttemptAt,
    lastAttemptAt: connection.lastAttemptAt,
    lastSuccessAt: connection.lastSuccessAt,
    lastError: connection.lastError,
    lastAppliedCount: connection.lastAppliedCount,
  });
  const failureRecordedAt = Date.now();

  syncState.lastAttemptAtMs = failureRecordedAt;
  syncState.consecutiveFailures += 1;
  syncState.lastError = errorMessage;
  syncState.lastAppliedCount = 0;

  const exhaustedRetries = syncState.consecutiveFailures >= env.federationSyncFailureMaxRetries;
  syncState.nextAttemptAtMs = exhaustedRetries
    ? 0
    : failureRecordedAt + defaultBackoffPolicy.computeDelay(syncState.consecutiveFailures);

  await persistFederationSyncState(connectionId, exhaustedRetries ? 'failed' : 'active', syncState);

  if (exhaustedRetries) {
    federationSyncStates.delete(connectionId);
  }

  return {
    exhaustedRetries,
    syncState,
  };
}

export function getFederationSyncLoopSnapshot() {
  return [...federationSyncStates.entries()].map(([connectionId, state]) => ({
    connectionId,
    consecutiveFailures: state.consecutiveFailures,
    nextAttemptAtMs: state.nextAttemptAtMs,
    lastAttemptAtMs: state.lastAttemptAtMs,
    lastSuccessAtMs: state.lastSuccessAtMs,
    lastError: state.lastError,
    lastAppliedCount: state.lastAppliedCount,
  }));
}
