export {
  ensureWorkspaceAdminAccess,
  getWorkspaceById,
  listWorkspaceProjectsForFederation,
  ensureFederatedWorkspaceReplica,
  upsertRemoteIdentity,
  listWorkspacePeers,
  listFederatedConnectionsForUser,
  getFederatedConnectionById,
  getVerifiedWorkspacePeerByPublicKey,
  getWorkspaceProjectRecordForFederation,
  getFederatedTicketWithProject,
  getFederatedCommentContext,
} from './db-helpers.js';

export {
  createFederationInvite,
  acceptFederationHandshake,
  connectToFederatedWorkspace,
} from './handshake.js';

export {
  createFederatedTicket,
  updateFederatedTicket,
  deleteFederatedTicket,
  createFederatedComment,
} from './mutations.js';

export {
  recordFederationSyncFailure,
  getFederationSyncLoopSnapshot,
} from './sync-state.js';

export {
  listFederationOutboxEvents,
  syncFederatedConnection,
  runFederationSyncSweep,
  startFederationSyncLoop,
  stopFederationSyncLoop,
} from './sync-loop.js';
