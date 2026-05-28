import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDataDir = path.join(__dirname, 'workspace_test_data');
const PORT = 5002;
const BASE_URL = `http://localhost:${PORT}`;
const TEST_DATABASE_URL = process.env.WORKSPACE_TEST_DATABASE_URL || process.env.DATABASE_URL || '';

const nativeFetch = globalThis.fetch.bind(globalThis);

function rewriteApiUrl(url: string) {
  if (!url.startsWith(`${BASE_URL}/api/`) || url.startsWith(`${BASE_URL}/api/auth/`)) {
    return url;
  }

  return url.replace(`${BASE_URL}/api/`, `${BASE_URL}/api/v1/`);
}

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === 'string') {
    return nativeFetch(rewriteApiUrl(input), init);
  }

  if (input instanceof URL) {
    return nativeFetch(new URL(rewriteApiUrl(input.toString())), init);
  }

  return nativeFetch(input, init);
}) as typeof fetch;

let serverProcess: ChildProcess | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function setupSandbox() {
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }

  fs.mkdirSync(testDataDir, { recursive: true });
}

function cleanupSandbox() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }

  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
}

async function startServer() {
  if (!TEST_DATABASE_URL) {
    throw new Error('WORKSPACE_TEST_DATABASE_URL or DATABASE_URL is required to run workspace-api.test.ts against PostgreSQL.');
  }

  serverProcess = spawn('npx', ['tsx', 'server/src/index.ts'], {
    cwd: path.join(__dirname, '..', '..'),
    env: {
      ...process.env,
      PORT: PORT.toString(),
      DATABASE_URL: TEST_DATABASE_URL,
      NODE_ENV: 'test',
      DB_DIR: testDataDir,
    },
    stdio: 'pipe',
  });

  let retries = 12;
  while (retries > 0) {
    try {
      const response = await fetch(`${BASE_URL}/api/users`);
      if (response.ok) {
        return;
      }
    } catch {
      // Wait for boot.
    }

    await sleep(500);
    retries -= 1;
  }

  throw new Error('Workspace API test server failed to start.');
}

async function postJson(pathname: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data };
}

async function patchJson(pathname: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data };
}

async function getJson(pathname: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, { headers });
  const data = await response.json();
  return { response, data };
}

async function run() {
  setupSandbox();

  try {
    await startServer();

    const ownerSignup = await postJson('/api/auth/sign-up', {
      name: 'Owner User',
      email: 'owner@gravity.dev',
      password: 'password123',
    });
    assert(ownerSignup.response.ok, 'Owner signup should succeed.');

    const collaboratorSignup = await postJson('/api/auth/sign-up', {
      name: 'Collaborator User',
      email: 'collab@gravity.dev',
      password: 'password123',
    });
    assert(collaboratorSignup.response.ok, 'Collaborator signup should succeed.');

    const ownerId = ownerSignup.data.user.id as string;
    const collaboratorId = collaboratorSignup.data.user.id as string;

    const createWorkspace = await postJson('/api/workspaces', {
      name: 'Remote Ops',
      description: 'Workspace test harness',
      key: 'ROPS',
      workspaceKey: 'ROPS-SECRET',
      ownerId,
      defaultProjectName: 'Remote Ops',
      defaultProjectKey: 'ROPS',
    });
    assert(createWorkspace.response.status === 201, 'Workspace creation should return 201.');

    const workspaceId = createWorkspace.data.workspace.id as string;
    const defaultProjectId = createWorkspace.data.workspace.defaultProjectId as string;
    assert(Boolean(defaultProjectId), 'Workspace creation should produce a default project id.');

    const ownerWorkspaces = await getJson(`/api/workspaces?userId=${encodeURIComponent(ownerId)}`);
    assert(ownerWorkspaces.response.ok, 'Owner workspace listing should succeed.');
    assert(ownerWorkspaces.data.some((workspace: { id: string }) => workspace.id === workspaceId), 'Created workspace should appear in owner listing.');

    const workspaceSettings = await getJson(`/api/workspaces/${workspaceId}/settings`);
    assert(workspaceSettings.response.ok, 'Workspace settings should load.');
    assert(workspaceSettings.data.workspaceKey === 'ROPS-SECRET', 'Workspace access key should round-trip.');

    const createInvite = await postJson(`/api/workspaces/${workspaceId}/invites`, {
      createdBy: ownerId,
      label: 'Initial collaborator invite',
    });
    assert(createInvite.response.status === 201, 'Workspace invite creation should return 201.');

    const inviteCode = createInvite.data.code as string;

    const joinRequest = await postJson(`/api/workspaces/invites/${encodeURIComponent(inviteCode)}/join-requests`, {
      userId: collaboratorId,
      message: 'Requesting access for integration test.',
    });
    assert(joinRequest.response.status === 201, 'Join request creation should return 201.');
    assert(joinRequest.data.status === 'pending', 'Join request should be pending before approval.');

    const pendingRequests = await getJson(`/api/workspaces/${workspaceId}/join-requests`);
    assert(pendingRequests.response.ok, 'Pending join request listing should succeed.');
    assert(pendingRequests.data.some((request: { id: string }) => request.id === joinRequest.data.id), 'Pending request should be discoverable.');

    const approveRequest = await postJson(`/api/workspaces/${workspaceId}/join-requests/${joinRequest.data.id}/approve`, {
      reviewerUserId: ownerId,
    });
    assert(approveRequest.response.ok, 'Join request approval should succeed.');
    assert(approveRequest.data.status === 'approved', 'Join request should transition to approved.');

    const workspaceMembers = await getJson(`/api/workspaces/${workspaceId}/members`);
    assert(workspaceMembers.response.ok, 'Workspace member listing should succeed.');
    assert(workspaceMembers.data.some((member: { id: string }) => member.id === collaboratorId), 'Approved collaborator should appear in workspace members.');

    const connectWorkspace = await postJson('/api/workspaces/connect', {
      userId: collaboratorId,
      workspaceId,
      workspaceKey: 'ROPS-SECRET',
    });
    assert(connectWorkspace.response.ok, 'Approved collaborator should be able to connect with the workspace key.');
    assert(connectWorkspace.data.projects.length === 1, 'Connected workspace should expose its default project.');

    const collaboratorProjects = await getJson(`/api/projects?userId=${encodeURIComponent(collaboratorId)}&workspaceId=${encodeURIComponent(workspaceId)}`);
    assert(collaboratorProjects.response.ok, 'Collaborator project listing should succeed after approval.');
    assert(collaboratorProjects.data.length === 1, 'Collaborator should see the workspace project after approval.');

    const updateSettings = await patchJson(`/api/workspaces/${workspaceId}/settings`, {
      hostUrl: 'http://localhost:5002',
      joinMode: 'approval_required',
      workspaceKey: 'ROPS-SECRET-2',
    }, { 'X-User-Id': ownerId });
    assert(updateSettings.response.ok, 'Workspace settings update should succeed.');
    assert(updateSettings.data.workspaceKey === 'ROPS-SECRET-2', 'Workspace settings update should persist the new workspace key.');

    const createRevokedPeerInvite = await postJson(
      '/api/workspaces/invites',
      {
        workspace_id: workspaceId,
        email: 'guest-user@peer.com',
        expiration_hours: 24,
      },
      { 'X-User-Id': ownerId },
    );
    assert(createRevokedPeerInvite.response.status === 201, 'Peer invite creation should return 201.');
    assert(typeof createRevokedPeerInvite.data.id === 'string', 'Peer invite should return an id.');
    assert(typeof createRevokedPeerInvite.data.invite_url === 'string', 'Peer invite should return an invite_url.');
    assert(typeof createRevokedPeerInvite.data.validation_code === 'string', 'Peer invite should return a validation_code.');
    assert(typeof createRevokedPeerInvite.data.expires_at === 'string', 'Peer invite should return an expires_at timestamp.');

    const peerInvites = await getJson(`/api/workspaces/${workspaceId}/peer-invites`, { 'X-User-Id': ownerId });
    assert(peerInvites.response.ok, 'Owner should be able to list peer invites.');
    assert(
      peerInvites.data.some(
        (invite: { email: string; validation_code: string }) =>
          invite.email === 'guest-user@peer.com' && invite.validation_code === createRevokedPeerInvite.data.validation_code,
      ),
      'Created peer invite should appear in the workspace peer invite listing.',
    );

    const collaboratorPeerInviteList = await getJson(`/api/workspaces/${workspaceId}/peer-invites`, { 'X-User-Id': collaboratorId });
    assert(collaboratorPeerInviteList.response.status === 403, 'Non-owner collaborators should not be allowed to list peer invites.');

    const revokePendingPeerInvite = await postJson(
      `/api/workspaces/${workspaceId}/peer-invites/${createRevokedPeerInvite.data.id}/revoke`,
      {},
      { 'X-User-Id': ownerId },
    );
    assert(revokePendingPeerInvite.response.ok, 'Owners should be able to revoke pending peer invites.');
    assert(typeof revokePendingPeerInvite.data.revoked_at === 'string', 'Revoked peer invites should expose revoked_at.');

    const revokedPeerValidation = await postJson('/api/workspaces/validate', {
      email: 'guest-user@peer.com',
      validation_code: createRevokedPeerInvite.data.validation_code,
      invite_url: createRevokedPeerInvite.data.invite_url,
      username: 'GuestExpert',
      password_hash: '$2b$12$SecureBcryptHashHereForTestingOnly1234567890123456789012',
    });
    assert(revokedPeerValidation.response.status === 400, 'Revoked peer invites should no longer validate.');

    const createPeerInvite = await postJson(
      '/api/workspaces/invites',
      {
        workspace_id: workspaceId,
        email: 'guest-validated@peer.com',
        expiration_hours: 24,
      },
      { 'X-User-Id': ownerId },
    );
    assert(createPeerInvite.response.status === 201, 'Second peer invite creation should return 201.');

    const invalidPeerValidation = await postJson('/api/workspaces/validate', {
      email: 'guest-validated@peer.com',
      validation_code: 'GRAV-0000-X',
      invite_url: createPeerInvite.data.invite_url,
      username: 'GuestExpert',
      password_hash: '$2b$12$InvalidHashForNegativePath',
    });
    assert(invalidPeerValidation.response.status === 401, 'Invalid peer validation codes should be rejected.');

    const validatePeerInvite = await postJson('/api/workspaces/validate', {
      email: 'guest-validated@peer.com',
      validation_code: createPeerInvite.data.validation_code,
      invite_url: createPeerInvite.data.invite_url,
      username: 'GuestExpert',
      password_hash: '$2b$12$SecureBcryptHashHereForTestingOnly1234567890123456789012',
    });
    assert(validatePeerInvite.response.ok, 'Peer invite validation should succeed.');
    assert(validatePeerInvite.data.authorized === true, 'Peer invite validation should authorize the guest.');
    assert(typeof validatePeerInvite.data.workspace_private_key === 'string', 'Peer validation should return a workspace_private_key.');
    assert(validatePeerInvite.data.guest_profile.username === 'GuestExpert', 'Peer validation should return the guest profile.');

    const guestUserId = validatePeerInvite.data.guest_profile.id as string;

    const guestWorkspaceList = await getJson(`/api/workspaces?userId=${encodeURIComponent(guestUserId)}`);
    assert(guestWorkspaceList.response.ok, 'Validated guests should be able to load workspace summaries through user-based access.');
    assert(
      guestWorkspaceList.data.some((workspace: { id: string }) => workspace.id === workspaceId),
      'Validated guests should see the shared workspace in user-based workspace listings.',
    );

    const guestProjects = await getJson(`/api/projects?userId=${encodeURIComponent(guestUserId)}&workspaceId=${encodeURIComponent(workspaceId)}`);
    assert(guestProjects.response.ok, 'Validated guests should be able to hydrate projects through user-based access.');
    assert(guestProjects.data.length >= 1, 'Validated guests should receive at least one project through user-based access.');

    const invalidWorkspaceKeyProjects = await getJson('/api/projects', { 'X-Workspace-Key': 'sec_wsp_invalid' });
    assert(invalidWorkspaceKeyProjects.response.status === 401, 'Invalid scoped workspace keys should be rejected for project hydration.');

    const scopedProjects = await getJson('/api/projects', {
      'X-Workspace-Key': validatePeerInvite.data.workspace_private_key,
    });
    assert(scopedProjects.response.ok, 'Scoped workspace project hydration should succeed for validated guests.');
    assert(scopedProjects.data.length >= 1, 'Scoped workspace hydration should return at least one project.');
    assert(Array.isArray(scopedProjects.data[0].domains), 'Scoped workspace hydration should include domains arrays.');
    assert(Array.isArray(scopedProjects.data[0].cycles), 'Scoped workspace hydration should include cycles arrays.');

    const seedScopedTicket = await postJson(
      '/api/tickets',
      {
        title: 'Scoped guest comment target',
        description: 'Target ticket for peer validation flows.',
        projectId: defaultProjectId,
      },
      { 'X-Project-Id': defaultProjectId },
    );
    assert(seedScopedTicket.response.status === 201, 'Seeding a scoped ticket should succeed.');

    const scopedComment = await postJson(
      `/api/tickets/${seedScopedTicket.data.id}/comments`,
      {
        content: 'Optimistic UI rendering test comment.',
      },
      { 'X-Workspace-Key': validatePeerInvite.data.workspace_private_key },
    );
    assert(scopedComment.response.status === 201, 'Scoped guest comment creation should succeed.');
    assert(scopedComment.data.body === 'Optimistic UI rendering test comment.', 'Scoped guest comment body should match.');
    assert(scopedComment.data.author.username === 'GuestExpert', 'Scoped guest comment should include the nested author username.');
    assert(scopedComment.data.author.role === 'guest_contributor', 'Scoped guest comment should include the guest role.');

    const scopedComments = await getJson(`/api/tickets/${seedScopedTicket.data.id}/comments`, {
      'X-Workspace-Key': validatePeerInvite.data.workspace_private_key,
    });
    assert(scopedComments.response.ok, 'Scoped guest comment listing should succeed.');
    assert(
      scopedComments.data.some((comment: { author?: { username?: string } }) => comment.author?.username === 'GuestExpert'),
      'Scoped guest comment listing should include the nested author object.',
    );

    const revokeValidatedPeerInvite = await postJson(
      `/api/workspaces/${workspaceId}/peer-invites/${createPeerInvite.data.id}/revoke`,
      {},
      { 'X-User-Id': ownerId },
    );
    assert(revokeValidatedPeerInvite.response.ok, 'Owners should be able to revoke validated peer invites.');
    assert(typeof revokeValidatedPeerInvite.data.revoked_at === 'string', 'Revoked validated invites should expose revoked_at.');

    const revokedScopedProjects = await getJson('/api/projects', {
      'X-Workspace-Key': validatePeerInvite.data.workspace_private_key,
    });
    assert(revokedScopedProjects.response.status === 401, 'Revoked scoped workspace keys should be rejected for project hydration.');

    const revokedGuestWorkspaceList = await getJson(`/api/workspaces?userId=${encodeURIComponent(guestUserId)}`);
    assert(revokedGuestWorkspaceList.response.ok, 'Revoked guests should still receive a valid workspace listing response.');
    assert(revokedGuestWorkspaceList.data.length === 0, 'Revoked guests should no longer see the shared workspace in user-based listings.');

    const revokedGuestProjects = await getJson(`/api/projects?userId=${encodeURIComponent(guestUserId)}&workspaceId=${encodeURIComponent(workspaceId)}`);
    assert(revokedGuestProjects.response.ok, 'Revoked guests should still receive a valid project listing response.');
    assert(revokedGuestProjects.data.length === 0, 'Revoked guests should no longer receive workspace projects through user-based access.');

    const peerInvitesAfterRevoke = await getJson(`/api/workspaces/${workspaceId}/peer-invites`, { 'X-User-Id': ownerId });
    assert(peerInvitesAfterRevoke.response.ok, 'Owner should still be able to list peer invites after revocation.');
    assert(
      peerInvitesAfterRevoke.data.some(
        (invite: { id: string; revoked_at?: string | null }) =>
          invite.id === createPeerInvite.data.id && typeof invite.revoked_at === 'string',
      ),
      'Validated peer invites should report revoked_at once access is revoked.',
    );

    console.log('workspace-api.test.ts passed');
  } finally {
    cleanupSandbox();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  cleanupSandbox();
  process.exitCode = 1;
});