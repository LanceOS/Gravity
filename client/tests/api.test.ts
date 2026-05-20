import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDataDir = path.join(__dirname, 'test_data');
const PORT = 5001;
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

// Visual Terminal Coloring Constants
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

let serverProcess: ChildProcess | null = null;

// Helper to wait
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Setup sandboxed test directory
function setupSandbox() {
  console.log(`\n${CYAN}${BOLD}=== Setting up sandboxed test environment ===${RESET}`);
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDataDir, { recursive: true });
}

// Clean up sandbox
function cleanupSandbox() {
  console.log(`\n${CYAN}${BOLD}=== Cleaning up sandboxed database storage ===${RESET}`);
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    console.log(`${YELLOW}Server child process terminated.${RESET}`);
  }
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
    console.log(`${YELLOW}Test data directory deleted.${RESET}`);
  }
}

// Start backend server
async function startServer(): Promise<void> {
  console.log(`${CYAN}Starting Gravity server on port ${PORT} with DB_DIR=${testDataDir}...${RESET}`);

  if (!TEST_DATABASE_URL) {
    throw new Error('WORKSPACE_TEST_DATABASE_URL or DATABASE_URL is required to run api.test.ts against PostgreSQL.');
  }
  
  serverProcess = spawn('npx', ['tsx', 'server/index.ts'], {
    cwd: path.join(__dirname, '..', '..'),
    env: {
      ...process.env,
      PORT: PORT.toString(),
      DATABASE_URL: TEST_DATABASE_URL,
      NODE_ENV: 'test',
      DB_DIR: testDataDir,
    },
    stdio: 'pipe'
  });

  serverProcess.stderr?.on('data', (data) => {
    console.error(`${RED}[Server Error]: ${data.toString().trim()}${RESET}`);
  });

  // Poll until server responds successfully
  let retries = 10;
  while (retries > 0) {
    try {
      const res = await fetch(`${BASE_URL}/api/users`);
      if (res.ok) {
        console.log(`${GREEN}✔ Server successfully online and responding to requests!${RESET}`);
        return;
      }
    } catch {
      // Wait for server to boot
    }
    await sleep(800);
    retries--;
  }

  throw new Error('Server failed to start within the timeout limit.');
}

// Global test variables
let testUserId = '';
let testInviteCode = '';
let createdTicketId = '';
let createdTicketKey = '';
let subTicketId = '';
let createdDomainId = '';
let createdCycleId = '';

// Assert helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

// Test cases
const tests = [
  {
    name: 'Credentials Sign-Up - Successful',
    fn: async () => {
      const res = await fetch(`${BASE_URL}/api/auth/sign-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Tester',
          email: 'jane@gravity.dev',
          password: 'password123'
        })
      });

      assert(res.status === 200, 'Signup status should be 200');
      const data = await res.json() as any;
      assert(data.user !== undefined, 'User object should be returned');
      assert(data.user.email === 'jane@gravity.dev', 'Returned email should match');
      assert(data.user.id.startsWith('u-'), 'User ID should start with u-');
      assert(data.user.tutorial_completed === 0, 'tutorial_completed should default to 0');
      
      testUserId = data.user.id;
    }
  },
  {
    name: 'Credentials Sign-Up - Missing Parameters (Edge Case)',
    fn: async () => {
      const res = await fetch(`${BASE_URL}/api/auth/sign-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '',
          email: 'jane@gravity.dev',
          password: ''
        })
      });

      assert(res.status === 400, 'Should reject registration with 400 Bad Request');
      const data = await res.json() as any;
      assert(data.error.includes('required'), 'Should return required fields error description');
    }
  },
  {
    name: 'Credentials Sign-Up - Duplicate Email Constraint (Edge Case)',
    fn: async () => {
      const res = await fetch(`${BASE_URL}/api/auth/sign-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Duplicate Jane',
          email: 'jane@gravity.dev',
          password: 'password456'
        })
      });

      assert(res.status === 400, 'Should reject duplicate email registration with 400');
      const data = await res.json() as any;
      assert(data.error.includes('already registered') || data.error.includes('UNIQUE constraint'), 'Should report email already registered');
    }
  },
  {
    name: 'Credentials Sign-In - Successful',
    fn: async () => {
      const res = await fetch(`${BASE_URL}/api/auth/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'jane@gravity.dev',
          password: 'password123'
        })
      });

      assert(res.status === 200, 'Signin status should be 200');
      const data = await res.json() as any;
      assert(data.user.id === testUserId, 'Signed in user ID should match registered ID');
      assert(data.user.name === 'Jane Tester', 'User name should match');
      assert(data.user.password === undefined, 'Password must be completely omitted in login API response for security');
    }
  },
  {
    name: 'Credentials Sign-In - Non-Existent User (Edge Case)',
    fn: async () => {
      const res = await fetch(`${BASE_URL}/api/auth/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'missing@gravity.dev',
          password: 'password123'
        })
      });

      assert(res.status === 401, 'Should fail with 401 Unauthorized for unknown emails');
      const data = await res.json() as any;
      assert(data.error.includes('not found') || data.error.includes('register'), 'Should report user not found error');
    }
  },
  {
    name: 'Credentials Sign-In - Incorrect Password (Edge Case)',
    fn: async () => {
      const res = await fetch(`${BASE_URL}/api/auth/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'jane@gravity.dev',
          password: 'wrongpassword'
        })
      });

      assert(res.status === 401, 'Should fail with 401 Unauthorized for bad passwords');
      const data = await res.json() as any;
      assert(data.error.includes('Incorrect password'), 'Should report incorrect password error');
    }
  },
  {
    name: 'User Onboarding Tutorial Persistence Status',
    fn: async () => {
      const res = await fetch(`${BASE_URL}/api/users/${testUserId}/tutorial`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true })
      });

      assert(res.ok, 'Tutorial update should succeed');
      const data = await res.json() as any;
      assert(data.user.tutorial_completed === 1, 'tutorial_completed should now be persisted as 1 (true) in the workspace database');
    }
  },
  {
    name: "Auto-Initialized Settings (GET Jane's Initial Defaults)",
    fn: async () => {
      // Jane was created in Test 1. Her settings should have been auto-seeded during signup.
      let res = await fetch(`${BASE_URL}/api/settings/${testUserId}`);
      assert(res.ok, 'GET Settings should succeed for a registered user');
      let settings = await res.json() as any;
      assert(settings.userId === testUserId, 'Should return settings mapped to correct userId');
      assert(settings.defaultView === 'board', 'Should fallback to default view: board');
      assert(settings.theme === 'dark', 'Should fallback to default theme: dark');
      assert(settings.ollamaEndpoint === 'http://localhost:11434', 'Should fallback to default local Ollama endpoint');
    }
  },
  {
    name: 'User Settings Management (PATCH & GET Updates)',
    fn: async () => {
      // 1. Patch settings for Jane Tester
      let res = await fetch(`${BASE_URL}/api/settings/${testUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultView: 'list',
          theme: 'light',
          ollamaModel: 'qwen2.5-coder',
          ollamaEndpoint: 'http://localhost:11434',
          projectLayout: 'compact'
        })
      });

      assert(res.ok, 'Settings patch should be successful');
      let settings = await res.json() as any;
      assert(settings.defaultView === 'list', 'Theme preferences should be patched');
      assert(settings.theme === 'light', 'Theme should be light');
      assert(settings.ollamaModel === 'qwen2.5-coder', 'Ollama model should be patched');
      assert(settings.projectLayout === 'compact', 'Project layout density should be patched');

      // 2. GET back Jane's settings to verify SQL database persistence
      res = await fetch(`${BASE_URL}/api/settings/${testUserId}`);
      assert(res.ok, 'GET settings should succeed');
      const loaded = await res.json() as any;
      assert(loaded.ollamaModel === 'qwen2.5-coder', 'Verify model retrieved matches patched value');
      assert(loaded.projectLayout === 'compact', 'Verify layout density matches patched value');
    }
  },
  {
    name: 'Projects Creation & Invite Code Generation',
    fn: async () => {
      const res = await fetch(`${BASE_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Sandboxed Test',
          description: 'A project for validation and testing',
          key: 'TST',
          status: 'active',
          ownerId: testUserId
        })
      });

      assert(res.status === 201, 'Project create status should be 201');
      const data = await res.json() as any;
      assert(data.key === 'TST', 'Project key prefix should match TST');
      assert(data.inviteCode !== undefined, 'Project should automatically generate an inviteCode');
      assert(data.inviteCode.startsWith('INV-TST-'), 'Invite code should follow INV-PREFIX pattern');
      
      testInviteCode = data.inviteCode;
    }
  },
  {
    name: 'Projects Creation Validation (Edge Case)',
    fn: async () => {
      const res = await fetch(`${BASE_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '',
          key: ''
        })
      });

      assert(res.status === 400, 'Projects creation should fail on missing fields with status 400');
      const data = await res.json() as any;
      assert(data.error.includes('required'), 'Should state name and key are required');
    }
  },
  {
    name: 'Project Members Manual Assignment',
    fn: async () => {
      // Manually add Jane Tester (testUserId) as developer to the gravity project
      const res = await fetch(`${BASE_URL}/api/projects/p-gravity/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: testUserId,
          role: 'developer'
        })
      });

      assert(res.status === 200, 'Adding members should succeed');
      const data = await res.json() as any;
      assert(data.success === true, 'Success flag should be true');
      assert(data.members.some((m: any) => m.id === testUserId), 'Jane should exist inside members list');

      // Duplicate assignment check (Edge Case)
      const resDup = await fetch(`${BASE_URL}/api/projects/p-gravity/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: testUserId,
          role: 'developer'
        })
      });
      assert(resDup.status === 400, 'Duplicate assignment should fail with 400');
    }
  },
  {
    name: 'Project Invites Acceptance & Distributed Membership API',
    fn: async () => {
      // Alice (AI Agent, seeded user) joins project TST using the invite code
      const res = await fetch(`${BASE_URL}/api/projects/invite/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode: testInviteCode,
          userId: 'u-alice'
        })
      });

      assert(res.status === 200, 'Invite acceptance should succeed');
      const data = await res.json() as any;
      assert(data.success === true, 'Success flag should be true');
      assert(data.project.key === 'TST', 'Joined project key should match');
    }
  },
  {
    name: 'Project Invites Acceptance - Invalid Invite (Edge Case)',
    fn: async () => {
      const res = await fetch(`${BASE_URL}/api/projects/invite/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode: 'INV-FAKE-9999',
          userId: 'u-alice'
        })
      });

      assert(res.status === 404, 'Should reject invalid invite code with 404');
    }
  },
  {
    name: 'Projects Filtered Listing (Query User ID)',
    fn: async () => {
      // Retrieve projects Jane has joined
      const res = await fetch(`${BASE_URL}/api/projects?userId=${testUserId}`);
      assert(res.ok, 'Projects search with userId query should succeed');
      const projects = await res.json() as any[];
      assert(projects.length > 0, 'Jane should be joined to projects she owned/created');
      assert(projects.some(p => p.name === 'Sandboxed Test'), 'Jane should belong to project TST');
    }
  },
  {
    name: 'Dynamic Tenant-Database Multi-Tenant Isolation API',
    fn: async () => {
      // Create a ticket in standard seeded project p-gravity (resolves gravity DB tenant)
      let res1 = await fetch(`${BASE_URL}/api/tickets`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Project-Id': 'p-gravity' 
        },
        body: JSON.stringify({
          title: 'Implement database encryption',
          description: 'Secure sensitive database tables.',
          status: 'todo',
          priority: 'high',
          projectId: 'p-gravity',
          assigneeId: 'u-bob'
        })
      });

      assert(res1.status === 201, 'Ticket creation should succeed in p-gravity database');
      const ticket1 = await res1.json() as any;
      assert(ticket1.key.startsWith('GRA-'), 'Ticket key prefix should reflect project gravity key GRA');
      createdTicketId = ticket1.id;
      createdTicketKey = ticket1.key;

      // Create another ticket in seeded p-ai project (resolves ai DB tenant)
      let res2 = await fetch(`${BASE_URL}/api/tickets`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Project-Id': 'p-ai' 
        },
        body: JSON.stringify({
          title: 'Tune Ollama Llama3 prompts',
          description: 'Refine system instruction templates.',
          status: 'todo',
          priority: 'medium',
          projectId: 'p-ai',
          assigneeId: 'u-alice'
        })
      });

      assert(res2.status === 201, 'Ticket creation should succeed in p-ai database');
      const ticket2 = await res2.json() as any;
      assert(ticket2.key.startsWith('AI-'), 'Ticket key prefix should reflect AI project');

      // Verify that fetching tickets from p-gravity does NOT contain the ticket from p-ai
      let listRes = await fetch(`${BASE_URL}/api/tickets?projectId=p-gravity`);
      assert(listRes.ok, 'GET tickets from p-gravity should succeed');
      const list = await listRes.json() as any[];
      assert(list.some(t => t.id === createdTicketId), 'Should include gravity ticket');
      assert(!list.some(t => t.id === ticket2.id), 'Database isolation check failed! p-gravity list contains p-ai tickets!');
    }
  },
  {
    name: 'Dynamic Tenant-Database Context Errors (Edge Cases)',
    fn: async () => {
      // Fetching without a X-Project-Id or query param. Should throw a 500/400 validation error
      const res = await fetch(`${BASE_URL}/api/tickets`);
      assert(res.status === 500 || res.status === 400, 'Fetching ticket list without project context should fail');
      
      // Fetching single ticket detail without context.
      const res2 = await fetch(`${BASE_URL}/api/tickets/${createdTicketId}`);
      assert(res2.status === 500, 'Fetching single ticket without project context should fail');

      // Fetching non-existent ticket inside correct context.
      const res3 = await fetch(`${BASE_URL}/api/tickets/t-non-existent?projectId=p-gravity`);
      assert(res3.status === 404, 'Fetching non-existent ticket should return 404');
    }
  },
  {
    name: 'Ticket Patching API (Modify Ticket properties)',
    fn: async () => {
      const res = await fetch(`${BASE_URL}/api/tickets/${createdTicketId}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'X-Project-Id': 'p-gravity'
        },
        body: JSON.stringify({
          status: 'in_progress',
          priority: 'urgent',
          description: 'Updated ticket description text.'
        })
      });

      assert(res.ok, 'Ticket PATCH update should succeed');
      const updated = await res.json() as any;
      assert(updated.status === 'in_progress', 'Status updated successfully');
      assert(updated.priority === 'urgent', 'Priority updated successfully');
      assert(updated.description === 'Updated ticket description text.', 'Description updated successfully');
    }
  },
  {
    name: 'Ticket Checklist / Sub-ticket Relations',
    fn: async () => {
      // Create sub-ticket pointing to parentId (createdTicketId)
      const res = await fetch(`${BASE_URL}/api/tickets`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Project-Id': 'p-gravity'
        },
        body: JSON.stringify({
          title: 'Implement database keys checks',
          projectId: 'p-gravity',
          parentId: createdTicketId
        })
      });

      assert(res.status === 201, 'Sub-ticket creation should succeed');
      const sub = await res.json() as any;
      assert(sub.parentId === createdTicketId, 'Sub-ticket parentId should match the parent');
      subTicketId = sub.id;

      // GET parent ticket detailed view and verify subTickets array includes sub-ticket details
      const detailRes = await fetch(`${BASE_URL}/api/tickets/${createdTicketId}?projectId=p-gravity`);
      assert(detailRes.ok, 'GET parent ticket detail should succeed');
      const detail = await detailRes.json() as any;
      assert(detail.subTickets !== undefined, 'subTickets array should be fetched');
      assert(detail.subTickets.some((t: any) => t.id === subTicketId), 'Subtask check should be included');
    }
  },
  {
    name: 'Thread Comments & WAL Attached Cross-DB Joins',
    fn: async () => {
      // Post comment under Jane Tester (testUserId) inside gravity tenant database
      const res = await fetch(`${BASE_URL}/api/tickets/${createdTicketId}/comments`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Project-Id': 'p-gravity'
        },
        body: JSON.stringify({
          userId: testUserId,
          body: 'Jane posted a test comment here.'
        })
      });

      assert(res.status === 201, 'Posting comment should succeed');
      const comment = await res.json() as any;
      assert(comment.body === 'Jane posted a test comment here.', 'Comment body matches');
      assert(comment.userName === 'Jane Tester', 'Should perform attached database join for username from central DB');
      assert(comment.userAvatar.includes('bottts'), 'Should join avatar');
      assert(comment.author.username === 'Jane Tester', 'Should return nested author.username in the comment response');
      assert(comment.author.role === 'guest_contributor', 'Should return nested author.role in the comment response');
    }
  },
  {
    name: 'SSE Live Stream Broadcaster & Real-time Client',
    fn: async () => {
      // 1. Programmatically connect to the SSE broadcast endpoint
      const sseRes = await fetch(`${BASE_URL}/api/events/subscribe`);
      assert(sseRes.ok, 'SSE subscription HTTP handshaking should succeed');
      
      const reader = sseRes.body?.getReader();
      assert(reader !== undefined, 'SSE response body reader should be accessible');

      const decoder = new TextDecoder();

      // 2. Read initial connection message
      const chunk1 = await reader!.read();
      const text1 = decoder.decode(chunk1.value);
      assert(text1.includes('Connected to Gravity live stream'), 'Verify initial handshake message');

      // 3. Initiate background reader promise to catch the comment broadcast
      const sseReadPromise = reader!.read().then(chunk => {
        return decoder.decode(chunk.value);
      });

      // 4. Post comment to trigger a comment update sse broadcast
      const postRes = await fetch(`${BASE_URL}/api/tickets/${createdTicketId}/comments`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Project-Id': 'p-gravity'
        },
        body: JSON.stringify({
          userId: 'u-alice',
          body: 'Broadcasting live over SSE stream!'
        })
      });
      assert(postRes.status === 201, 'Comment trigger post should succeed');

      // 5. Await read promise and assert it captured the broadcasted update event
      const broadcastText = await sseReadPromise;
      assert(broadcastText.includes('comments-updated'), 'SSE payload should be type comments-updated');
      assert(broadcastText.includes('Broadcasting live over SSE stream!'), 'SSE payload should contain comment body');

      // 6. Clean up the event stream reader connection
      await reader!.cancel();
    }
  },
  {
    name: 'GitHub Webhooks PR Integration - Opened Pull Request',
    fn: async () => {
      // Post opened pull request referencing the ticket key created (createdTicketKey)
      const res = await fetch(`${BASE_URL}/api/webhooks/github`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request'
        },
        body: JSON.stringify({
          action: 'opened',
          pull_request: {
            number: 101,
            html_url: 'https://github.com/lance/gravity/pull/101',
            title: `Implement security layer for key ${createdTicketKey}`,
            head: { ref: 'feature/db-security' },
            user: { login: 'jane-dev' }
          }
        })
      });

      assert(res.status === 200, 'Webhook post should succeed');
      const data = await res.json() as any;
      assert(data.updatedTickets.includes(createdTicketKey), 'Webhook must parse and find our ticket key');

      // Verify the ticket status in the workspace database was transitioned to in_review
      const ticketRes = await fetch(`${BASE_URL}/api/tickets/${createdTicketId}?projectId=p-gravity`);
      const ticket = await ticketRes.json() as any;
      assert(ticket.status === 'in_review', 'Ticket status should transition to in_review');
      assert(ticket.prStatus === 'open', 'PR status should reflect open');
      assert(ticket.prUrl === 'https://github.com/lance/gravity/pull/101', 'PR URL should be synced');
      
      // Verify automatic PR warning comment was posted
      assert(ticket.comments.some((c: any) => c.body.includes('GitHub PR Alert')), 'Webhook should post automatic alert comment');
    }
  },
  {
    name: 'GitHub Webhooks PR Integration - Closed and Merged Pull Request',
    fn: async () => {
      // Post merged closed pull request
      const res = await fetch(`${BASE_URL}/api/webhooks/github`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request'
        },
        body: JSON.stringify({
          action: 'closed',
          pull_request: {
            number: 101,
            html_url: 'https://github.com/lance/gravity/pull/101',
            title: `Implement security layer for key ${createdTicketKey}`,
            head: { ref: 'feature/db-security' },
            user: { login: 'jane-dev' },
            merged: true // This dictates merge
          }
        })
      });

      assert(res.status === 200, 'Webhook post should succeed');

      // Verify the ticket status transitioned to done
      const ticketRes = await fetch(`${BASE_URL}/api/tickets/${createdTicketId}?projectId=p-gravity`);
      const ticket = await ticketRes.json() as any;
      assert(ticket.status === 'done', 'Ticket status should now transition to done');
      assert(ticket.prStatus === 'merged', 'PR status should reflect merged');
    }
  },
  {
    name: 'Tickets Deletion API',
    fn: async () => {
      // Delete the sub-ticket we created earlier
      const res = await fetch(`${BASE_URL}/api/tickets/${subTicketId}?projectId=p-gravity`, {
        method: 'DELETE'
      });

      assert(res.status === 200, 'Deleting a ticket should return 200');
      const data = await res.json() as any;
      assert(data.success === true, 'Success flag returned');

      // Attempt to retrieve deleted ticket inside correct context, expect 404
      const resVerify = await fetch(`${BASE_URL}/api/tickets/${subTicketId}?projectId=p-gravity`);
      assert(resVerify.status === 404, 'Retrieving deleted ticket should yield 404');
    }
  },
  {
    name: 'Relational Domains Creation & Listing',
    fn: async () => {
      // 1. Post a new domain
      const res = await fetch(`${BASE_URL}/api/domains`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Project-Id': 'p-gravity'
        },
        body: JSON.stringify({
          name: 'Security Ops',
          color: '#ef4444'
        })
      });

      assert(res.status === 201, 'Domain creation should yield 201');
      const domain = await res.json() as any;
      assert(domain.name === 'Security Ops', 'Domain name matches');
      assert(domain.color === '#ef4444', 'Color matches');
      createdDomainId = domain.id;

      // 2. Fetch list and verify it is included
      const listRes = await fetch(`${BASE_URL}/api/domains?projectId=p-gravity`);
      assert(listRes.ok, 'List domains should succeed');
      const list = await listRes.json() as any[];
      assert(list.some(d => d.id === createdDomainId), 'Domain list should include newly created domain');
    }
  },
  {
    name: 'Relational Cycles Sprint Creation & Listing',
    fn: async () => {
      const start = new Date().toISOString();
      const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      // 1. Post new cycle
      const res = await fetch(`${BASE_URL}/api/cycles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Id': 'p-gravity'
        },
        body: JSON.stringify({
          name: 'Sprint 3: Verification',
          startDate: start,
          endDate: end
        })
      });

      assert(res.status === 201, 'Cycle creation should yield 201');
      const cycle = await res.json() as any;
      assert(cycle.name === 'Sprint 3: Verification', 'Cycle name matches');
      createdCycleId = cycle.id;

      // 2. Fetch list and verify it contains our sprint
      const listRes = await fetch(`${BASE_URL}/api/cycles?projectId=p-gravity`);
      assert(listRes.ok, 'List cycles should succeed');
      const list = await listRes.json() as any[];
      assert(list.some(c => c.id === createdCycleId), 'Cycle list should include newly created cycle');
    }
  },
  {
    name: 'Aggregated Project Hydration Includes Domains and Cycles',
    fn: async () => {
      const res = await fetch(`${BASE_URL}/api/projects?userId=${testUserId}`);
      assert(res.ok, 'Aggregated project hydration should succeed');
      const projects = await res.json() as any[];
      const gravityProject = projects.find((project) => project.id === 'p-gravity');
      assert(gravityProject !== undefined, 'Hydration should include the seeded gravity project');
      assert(Array.isArray(gravityProject.domains), 'Hydration should include a domains array');
      assert(Array.isArray(gravityProject.cycles), 'Hydration should include a cycles array');
      assert(gravityProject.domains.some((domain: any) => domain.id === createdDomainId), 'Hydration should include the created domain');
      assert(gravityProject.cycles.some((cycle: any) => cycle.id === createdCycleId), 'Hydration should include the created cycle');
    }
  },
  {
    name: 'MCP Standard Handshake & initialize Handlers',
    fn: async () => {
      const res = await fetch(`${BASE_URL}/api/mcp/sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {}
        })
      });

      assert(res.status === 200, 'MCP initialize should return 200');
      const data = await res.json() as any;
      assert(data.jsonrpc === '2.0', 'JSON-RPC version is 2.0');
      assert(data.result.protocolVersion === '2024-11-05', 'Protocol version matches');
      assert(data.result.serverInfo.name === 'gravity-mcp-server', 'Server name matches');
    }
  },
  {
    name: 'MCP Standard tools/list handler',
    fn: async () => {
      const res = await fetch(`${BASE_URL}/api/mcp/sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {}
        })
      });

      assert(res.status === 200, 'Tools list should return 200');
      const data = await res.json() as any;
      assert(Array.isArray(data.result.tools), 'Result tools must be an array');
      assert(data.result.tools.some((t: any) => t.name === 'list_tickets'), 'Exposes list_tickets');
      assert(data.result.tools.some((t: any) => t.name === 'get_ticket_details'), 'Exposes get_ticket_details');
    }
  },
  {
    name: 'MCP Stdio tools/call Executions API',
    fn: async () => {
      // 1. Call list_tickets via MCP tools/call
      let res = await fetch(`${BASE_URL}/api/mcp/sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'list_tickets',
            arguments: {
              projectId: 'p-gravity',
              status: 'done'
            }
          }
        })
      });

      assert(res.status === 200, 'Tools call should yield 200');
      let data = await res.json() as any;
      assert(data.result !== undefined, 'result object returned');
      const text = data.result.content[0].text;
      const list = JSON.parse(text) as any[];
      assert(Array.isArray(list), 'Parsed text should be tickets array');
      assert(list.some(t => t.id === createdTicketId), 'Tickets list contains our created ticket');

      // 2. Call get_ticket_details via MCP tools/call
      res = await fetch(`${BASE_URL}/api/mcp/sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'get_ticket_details',
            arguments: {
              ticketKey: createdTicketKey
            }
          }
        })
      });
      data = await res.json() as any;
      const details = JSON.parse(data.result.content[0].text) as any;
      assert(details.key === createdTicketKey, 'Key matches details key');
      assert(details.comments.length > 0, 'Includes posted thread comments');

      // 3. Call create_ticket via MCP tools/call
      res = await fetch(`${BASE_URL}/api/mcp/sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'create_ticket',
            arguments: {
              title: 'MCP Formulated Ticket',
              description: 'Created through standard JSON-RPC mcp routers',
              projectId: 'p-gravity',
              status: 'todo'
            }
          }
        })
      });
      data = await res.json() as any;
      const createResponse = JSON.parse(data.result.content[0].text) as any;
      assert(createResponse.ticket.title === 'MCP Formulated Ticket', 'Verify title of MCP ticket');
      const mcpTicketKey = createResponse.ticket.key;

      // 4. Call update_ticket via MCP tools/call
      res = await fetch(`${BASE_URL}/api/mcp/sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: {
            name: 'update_ticket',
            arguments: {
              ticketKey: mcpTicketKey,
              status: 'in_progress',
              priority: 'high'
            }
          }
        })
      });
      data = await res.json() as any;
      const updateResponse = JSON.parse(data.result.content[0].text) as any;
      assert(updateResponse.ticket.status === 'in_progress', 'Verify status patched through MCP');
      assert(updateResponse.ticket.priority === 'high', 'Verify priority patched through MCP');

      // 5. Call add_comment via MCP tools/call
      res = await fetch(`${BASE_URL}/api/mcp/sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: {
            name: 'add_comment',
            arguments: {
              ticketKey: mcpTicketKey,
              userId: 'u-alice',
              body: 'Comment posted through standard MCP stdio JSON-RPC routing.'
            }
          }
        })
      });
      data = await res.json() as any;
      const commentResponse = JSON.parse(data.result.content[0].text) as any;
      assert(commentResponse.comment.body === 'Comment posted through standard MCP stdio JSON-RPC routing.', 'Verify comment body');
    }
  },
  {
    name: 'MCP Error Handlers & Protocol Failures (Edge Case)',
    fn: async () => {
      // 1. Send invalid method, expect -32601 Method not found
      let res = await fetch(`${BASE_URL}/api/mcp/sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/non-existent',
          params: {}
        })
      });

      assert(res.status === 200, 'HTTP standard should return 200 containing error payload');
      let data = await res.json() as any;
      assert(data.error !== undefined, 'Should return error payload');
      assert(data.error.code === -32601, 'Error code should represent Method Not Found');

      // 2. Call tool with invalid params (missing ticketKey in get_ticket_details)
      res = await fetch(`${BASE_URL}/api/mcp/sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: {
            name: 'get_ticket_details',
            arguments: {} // missing required ticketKey
          }
        })
      });
      data = await res.json() as any;
      assert(data.error !== undefined, 'Should return error payload');
      assert(data.error.code === -32603, 'Error code should represent execution failure -32603');
    }
  },
  {
    name: 'Ollama Model Discovery Wrapper - Safe Empty Array Failover',
    fn: async () => {
      const res = await fetch(`${BASE_URL}/api/ai/ollama/models?ollamaUrl=${encodeURIComponent('http://localhost:9999')}`);
      assert(res.status === 200, 'Offline Ollama model discovery should return 200 for safe failover');
      const data = await res.json() as any;
      assert(Array.isArray(data), 'Ollama model discovery should return an array payload');
      assert(data.length === 0, 'Offline Ollama model discovery should return an empty array');
    }
  },
  {
    name: 'Provider Connection Wrapper API - Structured Failure Payload',
    fn: async () => {
      const res = await fetch(`${BASE_URL}/api/ai/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'deepseek',
          api_key: 'sk-ds-invalid-mock-test-key'
        })
      });

      assert(res.status === 400, 'Structured connection wrapper should return 400 for invalid credentials');
      const data = await res.json() as any;
      assert(data.connected === false, 'Structured connection wrapper should report connected=false');
      assert(data.latency_ms === null, 'Structured connection wrapper should report null latency on failure');
      assert(typeof data.error === 'string' && data.error.length > 0, 'Structured connection wrapper should include an error string');
    }
  },
  {
    name: 'OpenAI Connection Key Tester API - Graceful Failure',
    fn: async () => {
      // Testing an invalid key to check validation routing handles external calls with graceful errors
      const res = await fetch(`${BASE_URL}/api/ai/test-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: 'sk-invalid-mock-test-key'
        })
      });

      assert(res.status === 401 || res.status === 400 || res.status === 502, 'Should reject invalid credentials gracefully');
      const data = await res.json() as any;
      assert(data.error !== undefined, 'Error message should be returned in body');
    }
  },
  {
    name: 'Local Ollama proxy router - Extended Timeout Check',
    fn: async () => {
      // Testing with a fake offline endpoint to ensure the proxy handles connection refusals gracefully
      const res = await fetch(`${BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ollamaUrl: 'http://localhost:9999', // offline port
          model: 'llama3',
          messages: [{ role: 'user', content: 'hello' }]
        })
      });

      assert(res.status === 502, 'Should return 502 Bad Gateway for offline/refused proxy connections');
      const data = await res.json() as any;
      assert(data.error.includes('Could not connect to Ollama'), 'Should report connection failure warning');
    }
  }
];

// Main runner
async function runSuite() {
  setupSandbox();
  
  let successCount = 0;
  let failureCount = 0;

  try {
    await startServer();
    
    console.log(`\n${CYAN}${BOLD}=== Running Integration Test Suite ===${RESET}\n`);

    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      process.stdout.write(`${CYAN}[${i + 1}/${tests.length}] Running Test: ${t.name}... ${RESET}`);
      
      try {
        await t.fn();
        process.stdout.write(`${GREEN}✔ PASS${RESET}\n`);
        successCount++;
      } catch (err: any) {
        process.stdout.write(`${RED}✘ FAIL${RESET}\n`);
        console.error(`${RED}${BOLD}Reason: ${err.message}${RESET}\n`);
        failureCount++;
      }
    }

    console.log(`\n${BOLD}================================================${RESET}`);
    console.log(`${BOLD}Gravity API Integration Test Results Summary:${RESET}`);
    console.log(`  Passed Tests: ${GREEN}${BOLD}${successCount}${RESET}`);
    console.log(`  Failed Tests: ${RED}${BOLD}${failureCount}${RESET}`);
    console.log(`${BOLD}================================================${RESET}\n`);

    if (failureCount > 0) {
      process.exitCode = 1;
    } else {
      console.log(`${GREEN}${BOLD}✔ ALL INTEGRATION TESTS PASSED TRIUMPHANTLY!${RESET}\n`);
    }

  } catch (error: any) {
    console.error(`\n${RED}${BOLD}Critical error running test suite: ${error.message}${RESET}\n`);
    process.exitCode = 1;
  } finally {
    cleanupSandbox();
  }
}

runSuite();
