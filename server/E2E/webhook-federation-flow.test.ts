import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { seedUser, seedWorkspaceFixture, seedTicket } from '../tests/helpers/test-helpers.js';
import { ensureLocalNodeIdentity } from '../src/lib/node-identity.js';

const app = createApp();

describe('Server Webhooks, Federation & AI Flow E2E', () => {
  it('should successfully process webhooks, federation and handle AI model route scenarios', async () => {
    // --- PART 1: WEBHOOKS ---
    // Seed standard workspace fixture (Grace Hopper, Gravity Workspace GRV, project GRV-1, ticket GRV-1)
    const { owner, project } = await seedWorkspaceFixture();
    const ownerId = owner.id;
    const projectId = project.id;

    // Seed a ticket
    const ticket = await seedTicket(projectId, {
      id: 'ticket-web-1',
      key: 'GRV-1',
      title: 'Initial Webhook Ticket',
      status: 'todo',
    });
    const ticketId = ticket.id;
    const ticketKey = ticket.key;

    // 1. Post GitHub Webhook for OPENED Pull Request
    const resWebhookOpen = await request(app)
      .post('/api/v1/webhooks/github')
      .set('X-GitHub-Event', 'pull_request')
      .send({
        action: 'opened',
        pull_request: {
          number: 101,
          html_url: 'https://github.com/lance/gravity/pull/101',
          title: `Implement security layer for key ${ticketKey}`,
          head: { ref: 'feature/db-security' },
          user: { login: 'jane-dev' },
        },
      });

    expect(resWebhookOpen.status).toBe(200);
    expect(resWebhookOpen.body.updatedTickets).toContain(ticketKey);

    // Verify ticket status transitioned to in_review and PR status is open
    const resTicketDetailOpen = await request(app)
      .get(`/api/v1/tickets/${ticketId}?projectId=${encodeURIComponent(projectId)}`)
      .set('x-user-id', ownerId);

    expect(resTicketDetailOpen.status).toBe(200);
    expect(resTicketDetailOpen.body.status).toBe('in_review');
    expect(resTicketDetailOpen.body.prStatus).toBe('open');
    expect(resTicketDetailOpen.body.prUrl).toBe('https://github.com/lance/gravity/pull/101');

    // 2. Post GitHub Webhook for CLOSED AND MERGED Pull Request
    const resWebhookMerge = await request(app)
      .post('/api/v1/webhooks/github')
      .set('X-GitHub-Event', 'pull_request')
      .send({
        action: 'closed',
        pull_request: {
          number: 101,
          html_url: 'https://github.com/lance/gravity/pull/101',
          title: `Implement security layer for key ${ticketKey}`,
          head: { ref: 'feature/db-security' },
          user: { login: 'jane-dev' },
          merged: true,
        },
      });

    expect(resWebhookMerge.status).toBe(200);

    // Verify ticket status transitioned to done and PR status is merged
    const resTicketDetailMerged = await request(app)
      .get(`/api/v1/tickets/${ticketId}?projectId=${encodeURIComponent(projectId)}`)
      .set('x-user-id', ownerId);

    expect(resTicketDetailMerged.status).toBe(200);
    expect(resTicketDetailMerged.body.status).toBe('done');
    expect(resTicketDetailMerged.body.prStatus).toBe('merged');

    // --- PART 2: FEDERATION ---
    // Ensure node identity is initialized in pg-mem
    await ensureLocalNodeIdentity();

    // 3. GET /api/v1/federation/identity to read node identity
    const resIdentity = await request(app)
      .get('/api/v1/federation/identity');

    expect(resIdentity.status).toBe(200);
    expect(typeof resIdentity.body.publicKey).toBe('string');
    expect(resIdentity.body.publicKey.length).toBeGreaterThan(0);
    expect(typeof resIdentity.body.id).toBe('string');

    // --- PART 3: AI FLOW ---
    // 4. POST /api/v1/ai/test-key without API key (should fail 400)
    const resAiTestKeyMissing = await request(app)
      .post('/api/v1/ai/test-key')
      .send({
        provider: 'openai',
        apiKey: '',
      });

    expect(resAiTestKeyMissing.status).toBe(400);
    expect(resAiTestKeyMissing.body.error).toContain('required');

    // 5. GET /api/v1/ai/ollama/models with an unreachable Ollama URL (should fail gracefully returning connected: false)
    const resOllamaModelsUnreachable = await request(app)
      .get('/api/v1/ai/ollama/models?ollamaUrl=http://invalid-ollama-url-test:8888');

    expect(resOllamaModelsUnreachable.status).toBe(200);
    expect(resOllamaModelsUnreachable.body.connected).toBe(false);
    expect(resOllamaModelsUnreachable.body.models).toEqual([]);
    expect(resOllamaModelsUnreachable.body.error).toMatch(/Could not connect to Ollama|Failed to contact Ollama/i);
  });
});
