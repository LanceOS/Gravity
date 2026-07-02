import { and, asc, desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/index.js';
import { createRateLimiter } from '../../lib/rateLimit.js';
import { createRedisRateLimiter } from '../../lib/rateLimitRedis.js';
import { getRequestSourceIp } from '../../lib/request-ip.js';
import { createId } from '../../lib/platform.js';
import { env } from '../../env.js';
import { chatMessages, chatSessions, projects } from '../../db/schema.js';
import { resolveRequestActorUserId } from '../auth/utils/request-auth.js';
import { authorizeProjectMemberAccess } from '../workspaces/services/membership.js';
import { ChatService } from './services/chat-service.js';

const CHAT_ROLES = ['user', 'assistant', 'system'] as const;
const DEFAULT_CHAT_LIMIT = 20;
const MAX_CHAT_LIMIT = 100;
const CHAT_STREAM_RATE_LIMIT_MAX = 30;
const CHAT_STREAM_RATE_LIMIT_WINDOW_MS = 60_000;
const CHAT_STREAM_ALLOWED_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'deepseek', 'ollama']);

const createChatStreamLimiter = env.redisEnabled ? createRedisRateLimiter : createRateLimiter;
const streamLimiter = createChatStreamLimiter({
  windowMs: CHAT_STREAM_RATE_LIMIT_WINDOW_MS,
  max: CHAT_STREAM_RATE_LIMIT_MAX,
  keyFn: async (req) => {
    const projectId = normalizeRouteParam(req.params.projectId);
    const actorUserId = await resolveRequestActorUserId(req);
    const source = actorUserId ?? getRequestSourceIp(req) ?? req.ip;
    return `ai-chat:${projectId}:${source ?? 'anonymous'}`;
  },
});

const chatService = new ChatService();

type ChatRole = (typeof CHAT_ROLES)[number];

function normalizeRouteParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function normalizeChatTitle(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isValidMetadataValue(value: unknown): boolean {
  if (value === null) {
    return true;
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value === 'undefined') {
    return false;
  }

  if (Array.isArray(value)) {
    return value.every(isValidMetadataValue);
  }

  if (isPlainObject(value)) {
    return Object.values(value).every(isValidMetadataValue);
  }

  return false;
}

function normalizeChatMessageMetadata(value: unknown) {
  if (value === undefined || value === null) {
    return {};
  }

  if (!isValidMetadataValue(value)) {
    return null;
  }

  return value;
}

function normalizeChatMessageText(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
}

function normalizeChatProvider(value: unknown) {
  const provider = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return provider.length > 0 ? provider : '';
}

function normalizeChatModel(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeChatMaxTokens(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function sendChatSseEvent(res: any, payload: unknown) {
  if (res.writableEnded) {
    return;
  }

  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function normalizeChatRole(value: unknown): ChatRole | null {
  return typeof value === 'string' && CHAT_ROLES.includes(value as ChatRole) ? (value as ChatRole) : null;
}

function parseLimit(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') {
    return DEFAULT_CHAT_LIMIT;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CHAT_LIMIT;
  }

  return Math.min(parsed, MAX_CHAT_LIMIT);
}

function parseOffset(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function mapChatSessionRow(row: typeof chatSessions.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    teamId: row.teamId,
    userId: row.userId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapChatMessageRow(row: typeof chatMessages.$inferSelect) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createChatsRouter() {
  const router = Router();

  router.post('/projects/:projectId/chats', async (req, res) => {
    const projectId = normalizeRouteParam(req.params.projectId);
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required.' });
      return;
    }

    const auth = await authorizeProjectMemberAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const projectRows = await db
        .select({ teamId: projects.teamId })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      const project = projectRows[0];
      if (!project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      const now = new Date();
      const rows = await db
        .insert(chatSessions)
        .values({
          id: createId('chat'),
          projectId,
          teamId: project.teamId,
          userId: auth.userId,
          title: normalizeChatTitle(req.body?.title) || 'New Chat',
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const createdSession = rows[0];
      if (!createdSession) {
        throw new Error('Failed to create chat session.');
      }

      res.status(201).json(mapChatSessionRow(createdSession));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create chat session.' });
    }
  });

  router.get('/projects/:projectId/chats', async (req, res) => {
    const projectId = normalizeRouteParam(req.params.projectId);
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required.' });
      return;
    }

    const auth = await authorizeProjectMemberAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const limit = parseLimit(req.query.limit);
      const offset = parseOffset(req.query.offset);

      const rows = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.projectId, projectId), eq(chatSessions.userId, auth.userId)))
        .orderBy(desc(chatSessions.updatedAt), desc(chatSessions.id))
        .limit(limit)
        .offset(offset);

      res.json(rows.map(mapChatSessionRow));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list chat sessions.' });
    }
  });

  router.get('/projects/:projectId/chats/:chatId', async (req, res) => {
    const projectId = normalizeRouteParam(req.params.projectId);
    const chatId = normalizeRouteParam(req.params.chatId);

    if (!projectId || !chatId) {
      res.status(400).json({ error: 'Project ID and chat ID are required.' });
      return;
    }

    const auth = await authorizeProjectMemberAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const sessionRows = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.id, chatId), eq(chatSessions.projectId, projectId), eq(chatSessions.userId, auth.userId)))
        .limit(1);

      const session = sessionRows[0];
      if (!session) {
        res.status(404).json({ error: 'Chat session not found.' });
        return;
      }

      const messageRows = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, chatId))
        .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));

      res.json({
        ...mapChatSessionRow(session),
        messages: messageRows.map(mapChatMessageRow),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load chat session.' });
    }
  });

  router.patch('/projects/:projectId/chats/:chatId', async (req, res) => {
    const projectId = normalizeRouteParam(req.params.projectId);
    const chatId = normalizeRouteParam(req.params.chatId);

    if (!projectId || !chatId) {
      res.status(400).json({ error: 'Project ID and chat ID are required.' });
      return;
    }

    const auth = await authorizeProjectMemberAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const nextTitle = normalizeChatTitle(req.body?.title);
    if (!nextTitle) {
      res.status(400).json({ error: 'Chat title is required.' });
      return;
    }

    try {
      const rows = await db
        .update(chatSessions)
        .set({
          title: nextTitle,
          updatedAt: new Date(),
        })
        .where(and(eq(chatSessions.id, chatId), eq(chatSessions.projectId, projectId), eq(chatSessions.userId, auth.userId)))
        .returning();

      const updated = rows[0];
      if (!updated) {
        res.status(404).json({ error: 'Chat session not found.' });
        return;
      }

      res.json(mapChatSessionRow(updated));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update chat session.' });
    }
  });

  router.delete('/projects/:projectId/chats/:chatId', async (req, res) => {
    const projectId = normalizeRouteParam(req.params.projectId);
    const chatId = normalizeRouteParam(req.params.chatId);

    if (!projectId || !chatId) {
      res.status(400).json({ error: 'Project ID and chat ID are required.' });
      return;
    }

    const auth = await authorizeProjectMemberAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const rows = await db
        .delete(chatSessions)
        .where(and(eq(chatSessions.id, chatId), eq(chatSessions.projectId, projectId), eq(chatSessions.userId, auth.userId)))
        .returning({ id: chatSessions.id });

      if (!rows[0]) {
        res.status(404).json({ error: 'Chat session not found.' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete chat session.' });
    }
  });

  router.post('/projects/:projectId/chats/:chatId/messages', async (req, res) => {
    const projectId = normalizeRouteParam(req.params.projectId);
    const chatId = normalizeRouteParam(req.params.chatId);

    if (!projectId || !chatId) {
      res.status(400).json({ error: 'Project ID and chat ID are required.' });
      return;
    }

    const auth = await authorizeProjectMemberAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const role = normalizeChatRole(req.body?.role);
    if (!role) {
      res.status(400).json({ error: 'Role must be one of user, assistant, or system.' });
      return;
    }

    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) {
      res.status(400).json({ error: 'Message content is required.' });
      return;
    }

    const metadata = normalizeChatMessageMetadata(req.body?.metadata);
    if (metadata === null) {
      res.status(400).json({ error: 'Metadata must be valid JSON.' });
      return;
    }

    try {
      const sessionRows = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.id, chatId), eq(chatSessions.projectId, projectId), eq(chatSessions.userId, auth.userId)))
        .limit(1);

      const session = sessionRows[0];
      if (!session) {
        res.status(404).json({ error: 'Chat session not found.' });
        return;
      }

      const now = new Date();
      const messageRows = await db
        .insert(chatMessages)
        .values({
          id: createId('msg'),
          sessionId: chatId,
          role,
          content,
          metadata,
          createdAt: now,
        })
        .returning();

      const message = messageRows[0];
      if (!message) {
        throw new Error('Failed to append chat message.');
      }

      await db
        .update(chatSessions)
        .set({
          updatedAt: now,
        })
        .where(eq(chatSessions.id, chatId));

      res.status(201).json(mapChatMessageRow(message));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to append chat message.' });
    }
  });

  router.get('/projects/:projectId/chats/:chatId/stream', streamLimiter, async (req, res) => {
    const projectId = normalizeRouteParam(req.params.projectId);
    const chatId = normalizeRouteParam(req.params.chatId);

    if (!projectId || !chatId) {
      res.status(400).json({ error: 'Project ID and chat ID are required.' });
      return;
    }

    const auth = await authorizeProjectMemberAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const requestedProvider = normalizeChatProvider(req.query.provider ?? req.body?.provider);
    if (requestedProvider && !CHAT_STREAM_ALLOWED_PROVIDERS.has(requestedProvider)) {
      res.status(400).json({ error: 'Unsupported provider.' });
      return;
    }

    const userMessage = normalizeChatMessageText(req.query.message ?? req.body?.message ?? req.body?.content);
    const messageModel = normalizeChatModel(req.query.model ?? req.body?.model);
    const maxTokens = normalizeChatMaxTokens(req.query.maxTokens ?? req.body?.maxTokens);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    try {
      const response = await chatService.generateResponse({
        projectId,
        chatId,
        userId: auth.userId,
        message: userMessage,
        provider: requestedProvider || undefined,
        model: messageModel.length > 0 ? messageModel : undefined,
        maxTokens,
        onChunk: async (chunk) => {
          if (closed) {
            return;
          }

          sendChatSseEvent(res, {
            type: 'chunk',
            delta: chunk,
          });
        },
      });

      if (!closed) {
        sendChatSseEvent(res, {
          type: 'done',
          message: response.content,
          messageId: response.assistantMessageId,
          provider: response.provider,
          model: response.model,
          fallback: response.fallback,
          fallbackReason: response.fallbackReason,
          toolCalls: response.toolCalls ?? null,
        });
      }
    } catch (error) {
      if (!res.writableEnded) {
        sendChatSseEvent(res, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to generate chat response.',
        });
      }
    } finally {
      res.end();
    }
  });

  return router;
}
