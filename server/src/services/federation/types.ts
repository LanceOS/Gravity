export type FederatedWorkspaceReplica = {
  id: string;
  name: string;
  description: string;
  key: string;
  workspaceKey: string;
  defaultProjectId: string | null;
  hostUrl: string;
  createdBy: string;
  createdAt: string;
};

export type FederatedProjectReplica = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  key: string;
  status: string;
  inviteCode: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type FederationSyncConnectionState = {
  consecutiveFailures: number;
  nextAttemptAtMs: number;
  lastAttemptAtMs: number | null;
  lastSuccessAtMs: number | null;
  lastError: string | null;
  lastAppliedCount: number;
};

export type FederationSyncStateSeed = {
  consecutiveFailures: number;
  nextAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  lastAppliedCount: number;
};

export type FederatedTicketUpdate = Partial<{
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  domainId: string | null;
  cycleId: string | null;
  parentId: string | null;
  prStatus: string;
  prUrl: string | null;
}>;
