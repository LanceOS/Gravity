import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
import { createChatsRouter } from '../../src/modules/chats/routes.js';
import { ChatService } from '../../src/modules/chats/services/chat-service.js';

import * as membership from '../../src/modules/workspaces/services/membership.js';

// The legacy stateless endpoint must not bypass the project-chat controls.
import { createAiRouter } from '../../src/modules/ai/routes.js';
import { aiService } from '../../src/modules/ai/index.js';
import * as requestAuth from '../../src/modules/auth/utils/request-auth.js';
import { acquireGeneration } from '../../src/modules/ai/utils/generation-budget.js';


beforeEach(() => {
  vi.spyOn(membership, 'authorizeProjectMemberAccess').mockResolvedValue({ allowed: true, userId: 'fixture-user' } as any);
});

function harness() {
  const router = createChatsRouter();
  const route = router.stack.find(layer => layer.route?.path === '/projects/:projectId/chats/:chatId/stream')!.route!;
  const handle = route.stack.at(-1)!.handle;
  const req = Object.assign(new EventEmitter(), {
    params: { projectId: 'project', chatId: 'chat' }, query: {}, body: { message: 'Hello' }, aborted: false,
  });
  const res = Object.assign(new EventEmitter(), {
    writeHead: vi.fn(), write: vi.fn(), end: vi.fn(), destroyed: false, writableEnded: false,
  });
  return { req, res, run: () => handle(req as any, res as any, vi.fn()) };
}

it('aborts generation on response disconnect, but not on completed POST request close', async () => {
  let signal: AbortSignal | undefined;
  let started!: () => void;
  const waiting = new Promise<void>(resolve => { started = resolve; });
  vi.spyOn(ChatService.prototype, 'generateResponse').mockImplementation(async input => {
    signal = input.signal;
    started();
    return new Promise((_, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }));
  });
  const { req, res, run } = harness();
  const request = run();
  await waiting;
  req.emit('close');
  expect(signal?.aborted).toBe(false);
  res.emit('close');
  await request;
  expect(signal?.aborted).toBe(true);
  expect(res.write).not.toHaveBeenCalled();
  expect(res.listenerCount('close')).toBe(0);
  expect(req.listenerCount('aborted')).toBe(0);
});

it('removes disconnect handlers after successful completion', async () => {
  let signal: AbortSignal | undefined;
  vi.spyOn(ChatService.prototype, 'generateResponse').mockImplementation(async input => {
    signal = input.signal;
    return { assistantMessageId: 'message', content: 'Done', provider: 'openai', model: 'fixture', fallback: false };
  });
  const { req, res, run } = harness();
  await run();
  res.emit('close');
  expect(signal?.aborted).toBe(false);
  expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"type":"done"'));
  expect(req.listenerCount('aborted')).toBe(0);
});


function legacyHarness() {
  vi.spyOn(requestAuth, 'resolveRequestActorUserId').mockResolvedValue('legacy-user');
  const route = createAiRouter().stack.find(layer => layer.route?.path === '/ai/chat')!.route!;
  const req = Object.assign(new EventEmitter(), {
    body: { model: 'fixture', messages: [{ role: 'user', content: 'Hello' }] }, aborted: false,
  });
  const res: any = Object.assign(new EventEmitter(), {
    json: vi.fn(), destroyed: false, writableEnded: false,
  });
  res.status = vi.fn(() => res);
  return { req, res, run: () => route.stack.at(-1)!.handle(req as any, res, vi.fn()) };
}

it('bounds and cancels legacy provider reads', async () => {
  let signal: AbortSignal | undefined;
  let started!: () => void;
  const waiting = new Promise<void>(resolve => { started = resolve; });
  const chat = vi.spyOn(aiService, 'chat').mockImplementation(async (_user, _provider, options) => {
    expect(options.maxTokens).toBe(4096);
    signal = options.signal;
    started();
    return new Promise(() => {});
  });
  const { req, res, run } = legacyHarness();
  const request = run();
  await waiting;
  res.emit('close');
  await request;
  expect(signal?.aborted).toBe(true);
  expect(chat).toHaveBeenCalledOnce();
  expect(res.json).not.toHaveBeenCalled();
  expect(res.listenerCount('close')).toBe(0);
  expect(req.listenerCount('aborted')).toBe(0);
});

it('shares legacy concurrency limits with project chat and returns 429 when full', async () => {
  const release = [acquireGeneration('legacy-user', 'one'), acquireGeneration('legacy-user', 'two')];
  const chat = vi.spyOn(aiService, 'chat');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const { res, run } = legacyHarness();
    await run();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(chat).not.toHaveBeenCalled();
  } finally { release.forEach(fn => fn()); }
});
