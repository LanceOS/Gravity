import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import express from 'express';
import request from 'supertest';

const config = vi.hoisted(() => ({ githubWebhookSecret: undefined as string | undefined, nodeEnv: 'development', allowUnsignedLocalWebhooks: false }));
vi.mock('../src/env.js', () => ({ env: config }));
vi.mock('../src/lib/request-ip.js', () => ({ getRequestSourceIp: () => '127.0.0.1' }));
vi.mock('../src/realtime.js', () => ({ broadcastToWorkspace: vi.fn() }));
vi.mock('../src/modules/tickets/services/tickets.js', () => ({ getTicketById: vi.fn() }));
vi.mock('../src/modules/webhooks/processPullRequest.js', () => ({
  GITHUB_AUTOMATION_ACTOR: {}, normalizeGitHubRepositoryUrl: vi.fn(), normalizeGitHubPullRequestUrl: vi.fn(),
  processPullRequestEvent: vi.fn(), SUPPORTED_PR_ACTIONS: new Set(['opened']),
}));
import { createWebhookRouter } from '../src/modules/webhooks/routes.js';

const app = express().use(express.raw({ type: 'application/json' })).use(createWebhookRouter());
const body = JSON.stringify({ zen: 'signed fixture' });
const delivery = () => request(app).post('/webhooks/github').set('content-type', 'application/json').set('x-github-event', 'ping');
beforeEach(() => { config.githubWebhookSecret = undefined; config.nodeEnv = 'development'; config.allowUnsignedLocalWebhooks = false; });
describe('webhook security defaults', () => {
  it('rejects unsigned development delivery by default', async () => { expect((await delivery().send(body)).status).toBe(503); });
  it('accepts an explicit local opt-in but denies forwarded deliveries', async () => {
    config.allowUnsignedLocalWebhooks = true;
    expect((await delivery().send(body)).status).toBe(200);
    for (const header of ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip']) {
      expect((await delivery().set(header, '127.0.0.1').send(body)).status).toBe(503);
      expect((await delivery().set(header, '').send(body)).status).toBe(503);
    }
  });
  it('requires a valid signature whenever a secret is configured', async () => {
    config.githubWebhookSecret = 'independent-test-signing-key';
    config.allowUnsignedLocalWebhooks = true;
    expect((await delivery().send(body)).status).toBe(401);
    const signature = 'sha256=' + createHmac('sha256', config.githubWebhookSecret).update(body).digest('hex');
    expect((await delivery().set('x-hub-signature-256', signature).send(body)).status).toBe(200);
    expect((await delivery().set('x-hub-signature-256', signature).send('{}')).status).toBe(401);
  });
  it('never bypasses production signing', async () => {
    config.nodeEnv = 'production'; config.allowUnsignedLocalWebhooks = true;
    expect((await delivery().send(body)).status).toBe(503);
  });
});
