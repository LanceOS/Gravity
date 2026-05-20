import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDataDir = path.join(__dirname, 'workspace_test_data');
const PORT = 5002;
const BASE_URL = `http://localhost:${PORT}`;

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
  serverProcess = spawn('npx', ['tsx', 'server/index.ts'], {
    cwd: path.join(__dirname, '..', '..'),
    env: {
      ...process.env,
      PORT: PORT.toString(),
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

async function postJson(pathname: string, body: unknown) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data };
}

async function patchJson(pathname: string, body: unknown) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data };
}

async function getJson(pathname: string) {
  const response = await fetch(`${BASE_URL}${pathname}`);
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
      defaultProjectName: 'Remote Ops Core',
      defaultProjectKey: 'ROPS',
    });
    assert(createWorkspace.response.status === 201, 'Workspace creation should return 201.');

    const workspaceId = createWorkspace.data.workspace.id as string;

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
    });
    assert(updateSettings.response.ok, 'Workspace settings update should succeed.');
    assert(updateSettings.data.workspaceKey === 'ROPS-SECRET-2', 'Workspace settings update should persist the new workspace key.');

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