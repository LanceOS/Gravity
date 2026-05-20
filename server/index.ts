import express from 'express';
import cors from 'cors';
import { initCentralDB, getProjectDb, centralDb } from './db.js';
import { handleGithubWebhook, subscribeToEvents, broadcastEvent } from './webhooks.js';
import { handleMcpRequest } from './mcp.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Initialize the SQLite Central Database schema once on startup.
initCentralDB();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Helper to resolve the project-specific database dynamically based on requests
function getDb(req: express.Request) {
  const projectId = req.headers['x-project-id'] as string || req.query.projectId as string || req.body?.projectId as string;
  if (!projectId) {
    throw new Error('Project ID is required. Please set the X-Project-Id header or projectId parameter.');
  }
  return getProjectDb(projectId);
}

type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'deepseek';

const isAIProvider = (value: unknown): value is AIProvider =>
  value === 'openai' || value === 'anthropic' || value === 'gemini' || value === 'deepseek';

const providerLabels: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
};

const allowedSettingsFields = new Set([
  'defaultView',
  'ollamaModel',
  'ollamaEndpoint',
  'theme',
  'apiKey',
  'aiProvider',
  'projectLayout',
]);

const allowedWorkspaceSettingsFields = new Set(['hostUrl', 'joinMode', 'workspaceKey', 'defaultProjectId']);
const allowedProjectFields = new Set(['name', 'description', 'status']);

type JoinMode = 'approval_required' | 'auto_join';
type ProjectStatus = 'planned' | 'active' | 'completed';

const isJoinMode = (value: unknown): value is JoinMode => value === 'approval_required' || value === 'auto_join';
const isProjectStatus = (value: unknown): value is ProjectStatus => value === 'planned' || value === 'active' || value === 'completed';

function ensureUserSettings(userId: string) {
  centralDb.prepare(`
    INSERT OR IGNORE INTO user_settings (userId, defaultView, ollamaModel, ollamaEndpoint, theme, apiKey, aiProvider, projectLayout)
    VALUES (?, 'board', '', 'http://localhost:11434', 'dark', '', 'openai', 'standard')
  `).run(userId);
}

function ensureWorkspaceSettingsRecord(workspaceId: string) {
  centralDb.prepare(`
    INSERT OR IGNORE INTO workspace_settings (workspaceId, hostUrl, joinMode, createdAt, updatedAt)
    VALUES (?, '', 'approval_required', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(workspaceId);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json() as { error?: string | { message?: string } };
    if (typeof data.error === 'string') {
      return data.error;
    }
    if (typeof data.error?.message === 'string') {
      return data.error.message;
    }
  } catch {
    // Fall through to raw text parsing.
  }

  try {
    const text = await response.text();
    return text || fallback;
  } catch {
    return fallback;
  }
}

async function testProviderApiKey(provider: AIProvider, apiKey: string) {
  switch (provider) {
    case 'anthropic': {
      const response = await fetchWithTimeout('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Anthropic API key test failed.'));
      }
      return;
    }
    case 'gemini': {
      const response = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { method: 'GET' }
      );

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Gemini API key test failed.'));
      }
      return;
    }
    case 'deepseek': {
      const response = await fetchWithTimeout('https://api.deepseek.com/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'DeepSeek API key test failed.'));
      }
      return;
    }
    case 'openai':
    default: {
      const response = await fetchWithTimeout('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'OpenAI API key test failed.'));
      }
    }
  }
}

function normalizeOllamaUrl(url: string) {
  return url.replace(/\/$/, '');
}

function normalizeEntityKey(value: string) {
  return value.trim().toUpperCase();
}

function createWorkspaceAccessKey(workspaceKey: string) {
  return `WS-${normalizeEntityKey(workspaceKey)}-${Math.floor(100000 + Math.random() * 900000)}`;
}

function createProjectInviteCode(projectKey: string) {
  return `INV-${normalizeEntityKey(projectKey)}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function createWorkspaceInviteCode(workspaceKey: string) {
  return `WSP-${normalizeEntityKey(workspaceKey)}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function getWorkspaceSummary(workspaceId: string) {
  ensureWorkspaceSettingsRecord(workspaceId);

  return centralDb.prepare(`
    SELECT
      w.id,
      w.name,
      w.description,
      w.key,
      w.defaultProjectId,
      w.createdBy,
      w.createdAt,
      COALESCE(ws.hostUrl, w.hostUrl, '') AS hostUrl,
      COALESCE(ws.joinMode, 'approval_required') AS joinMode,
      COUNT(DISTINCT p.id) AS projectCount,
      COUNT(DISTINCT wm.userId) AS memberCount,
      COUNT(DISTINCT pending.id) AS pendingJoinRequestCount
    FROM workspaces w
    LEFT JOIN workspace_settings ws ON ws.workspaceId = w.id
    LEFT JOIN projects p ON p.workspaceId = w.id
    LEFT JOIN workspace_members wm ON wm.workspaceId = w.id
    LEFT JOIN workspace_join_requests pending ON pending.workspaceId = w.id AND pending.status = 'pending'
    WHERE w.id = ?
    GROUP BY w.id, ws.hostUrl, ws.joinMode
  `).get(workspaceId) as Record<string, unknown> | undefined;
}

function listWorkspaces(userId?: string) {
  if (userId) {
    return centralDb.prepare(`
      SELECT
        w.id,
        w.name,
        w.description,
        w.key,
        w.defaultProjectId,
        w.createdBy,
        w.createdAt,
        wm.role AS memberRole,
        COALESCE(ws.hostUrl, w.hostUrl, '') AS hostUrl,
        COALESCE(ws.joinMode, 'approval_required') AS joinMode,
        COUNT(DISTINCT p.id) AS projectCount,
        COUNT(DISTINCT members.userId) AS memberCount,
        COUNT(DISTINCT pending.id) AS pendingJoinRequestCount
      FROM workspaces w
      JOIN workspace_members wm ON wm.workspaceId = w.id AND wm.userId = ?
      LEFT JOIN workspace_settings ws ON ws.workspaceId = w.id
      LEFT JOIN projects p ON p.workspaceId = w.id
      LEFT JOIN workspace_members members ON members.workspaceId = w.id
      LEFT JOIN workspace_join_requests pending ON pending.workspaceId = w.id AND pending.status = 'pending'
      GROUP BY w.id, wm.role, ws.hostUrl, ws.joinMode
      ORDER BY w.createdAt DESC
    `).all(userId);
  }

  return centralDb.prepare(`
    SELECT
      w.id,
      w.name,
      w.description,
      w.key,
      w.defaultProjectId,
      w.createdBy,
      w.createdAt,
      COALESCE(ws.hostUrl, w.hostUrl, '') AS hostUrl,
      COALESCE(ws.joinMode, 'approval_required') AS joinMode,
      COUNT(DISTINCT p.id) AS projectCount,
      COUNT(DISTINCT wm.userId) AS memberCount,
      COUNT(DISTINCT pending.id) AS pendingJoinRequestCount
    FROM workspaces w
    LEFT JOIN workspace_settings ws ON ws.workspaceId = w.id
    LEFT JOIN projects p ON p.workspaceId = w.id
    LEFT JOIN workspace_members wm ON wm.workspaceId = w.id
    LEFT JOIN workspace_join_requests pending ON pending.workspaceId = w.id AND pending.status = 'pending'
    GROUP BY w.id, ws.hostUrl, ws.joinMode
    ORDER BY w.createdAt DESC
  `).all();
}

function getWorkspaceProjects(workspaceId: string) {
  return centralDb.prepare(`
    SELECT *
    FROM projects
    WHERE workspaceId = ?
    ORDER BY createdAt ASC
  `).all(workspaceId);
}

function getWorkspaceMembers(workspaceId: string) {
  return centralDb.prepare(`
    SELECT
      u.id,
      u.name,
      u.email,
      u.avatar,
      wm.role,
      wm.createdAt
    FROM workspace_members wm
    JOIN users u ON u.id = wm.userId
    WHERE wm.workspaceId = ?
    ORDER BY CASE WHEN wm.role = 'owner' THEN 0 ELSE 1 END, wm.createdAt ASC
  `).all(workspaceId);
}

function mirrorWorkspaceMembersToProject(projectId: string, workspaceId: string) {
  centralDb.prepare(`
    INSERT OR IGNORE INTO project_members (projectId, userId, role)
    SELECT ?, wm.userId, CASE WHEN wm.role = 'owner' THEN 'owner' ELSE 'developer' END
    FROM workspace_members wm
    WHERE wm.workspaceId = ?
  `).run(projectId, workspaceId);
}

function mirrorUserToWorkspaceProjects(workspaceId: string, userId: string, role: string) {
  centralDb.prepare(`
    INSERT OR IGNORE INTO project_members (projectId, userId, role)
    SELECT id, ?, CASE WHEN ? = 'owner' THEN 'owner' ELSE 'developer' END
    FROM projects
    WHERE workspaceId = ?
  `).run(userId, role, workspaceId);
}

function getWorkspaceAdminMembership(workspaceId: string, userId: string) {
  return centralDb.prepare(`
    SELECT *
    FROM workspace_members
    WHERE workspaceId = ?
      AND userId = ?
      AND role IN ('owner', 'admin')
  `).get(workspaceId, userId);
}

// ----------------------------------------------------
// 1. Credentials Authentication Routes
// ----------------------------------------------------

app.post('/api/auth/sign-up', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    res.status(400).json({ error: 'Name, email, and password are required.' });
    return;
  }

  try {
    const id = `u-${Date.now()}`;
    const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;
    
    centralDb.prepare(`
      INSERT INTO users (id, name, email, avatar, role, password, tutorial_completed)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(id, name, email, avatar, 'developer', password);

    // Initialize default settings
    centralDb.prepare(`
      INSERT INTO user_settings (userId, defaultView, ollamaModel, ollamaEndpoint, theme, apiKey, aiProvider, projectLayout)
      VALUES (?, 'board', '', 'http://localhost:11434', 'dark', '', 'openai', 'standard')
    `).run(id);

    const newUser = centralDb.prepare('SELECT id, name, email, avatar, role, tutorial_completed FROM users WHERE id = ?').get(id);
    broadcastEvent('users-updated', centralDb.prepare('SELECT id, name, email, avatar, role, tutorial_completed FROM users').all());
    
    res.status(200).json({ user: newUser, message: 'User registered successfully!' });
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'Email already registered.' });
    } else {
      res.status(500).json({ error: error.message || 'Registration failed.' });
    }
  }
});

app.post('/api/auth/sign-in', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  try {
    const user = centralDb.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (!user) {
      res.status(401).json({ error: 'User not found. Please register.' });
      return;
    }

    if (user.password !== password) {
      res.status(401).json({ error: 'Incorrect password.' });
      return;
    }

    // Omit password in response
    const { password: _, ...userSafe } = user;
    res.status(200).json({ user: userSafe, message: 'Signed in successfully!' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/users/:id/tutorial', (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;
  
  try {
    centralDb.prepare('UPDATE users SET tutorial_completed = ? WHERE id = ?').run(completed ? 1 : 0, id);
    const user = centralDb.prepare('SELECT id, name, email, avatar, role, tutorial_completed FROM users WHERE id = ?').get(id);
    
    broadcastEvent('users-updated', centralDb.prepare('SELECT id, name, email, avatar, role, tutorial_completed FROM users').all());
    res.json({ user });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------
// 2. Settings Management
// ----------------------------------------------------

app.get('/api/settings/:userId', (req, res) => {
  const { userId } = req.params;
  try {
    ensureUserSettings(userId);
    const settings = centralDb.prepare('SELECT * FROM user_settings WHERE userId = ?').get(userId);
    res.json(settings);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/settings/:userId', (req, res) => {
  const { userId } = req.params;
  const updates = Object.fromEntries(
    Object.entries({ ...req.body }).filter(([field]) => allowedSettingsFields.has(field))
  );

  if ('aiProvider' in updates && !isAIProvider(updates.aiProvider)) {
    res.status(400).json({ error: 'Unsupported AI provider.' });
    return;
  }

  try {
    ensureUserSettings(userId);

    const fields: string[] = [];
    const sqlParams: any[] = [];

    Object.entries(updates).forEach(([field, val]) => {
      fields.push(`${field} = ?`);
      sqlParams.push(val);
    });

    if (fields.length > 0) {
      sqlParams.push(userId);
      centralDb.prepare(`
        UPDATE user_settings
        SET ${fields.join(', ')}
        WHERE userId = ?
      `).run(...sqlParams);
    }

    const settings = centralDb.prepare('SELECT * FROM user_settings WHERE userId = ?').get(userId);
    res.json(settings);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Test Connection with Warning for OpenAI API
app.post('/api/ai/test-key', async (req, res) => {
  const requestedProvider = req.body?.provider;
  const provider: AIProvider = isAIProvider(requestedProvider) ? requestedProvider : 'openai';
  const { apiKey } = req.body;
  if (!apiKey) {
    res.status(400).json({ error: 'API Key is required to test.' });
    return;
  }

  try {
    await testProviderApiKey(provider, apiKey);
    res.json({ success: true, message: `${providerLabels[provider]} API key is valid. Connection succeeded.` });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Connection failed.' });
  }
});

app.get('/api/ollama/models', async (req, res) => {
  const ollamaUrl = typeof req.query.ollamaUrl === 'string' && req.query.ollamaUrl.trim().length > 0
    ? normalizeOllamaUrl(req.query.ollamaUrl)
    : 'http://localhost:11434';

  try {
    const response = await fetchWithTimeout(`${ollamaUrl}/api/tags`, { method: 'GET' }, 5000);

    if (!response.ok) {
      res.json({ models: [], error: await readErrorMessage(response, 'Failed to detect Ollama models.') });
      return;
    }

    const data = await response.json() as { models?: Array<{ name?: string }> };
    const models = Array.isArray(data.models)
      ? data.models
          .map((model) => model.name)
          .filter((name): name is string => Boolean(name))
      : [];

    res.json({ models });
  } catch (e: any) {
    res.json({ models: [], error: e.message || 'Failed to detect Ollama models.' });
  }
});

// ----------------------------------------------------
// 3. Workspace Directory, Invites, and Connections
// ----------------------------------------------------

app.get('/api/workspaces', (req, res) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    res.json(listWorkspaces(userId));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/workspaces', (req, res) => {
  const { name, description, key, workspaceKey, ownerId, defaultProjectName, defaultProjectKey, hostUrl, joinMode } = req.body;
  if (!name || !key || !ownerId) {
    res.status(400).json({ error: 'Workspace name, key, and ownerId are required.' });
    return;
  }

  if (joinMode !== undefined && !isJoinMode(joinMode)) {
    res.status(400).json({ error: 'Unsupported workspace join mode.' });
    return;
  }

  const owner = centralDb.prepare('SELECT id FROM users WHERE id = ?').get(ownerId);
  if (!owner) {
    res.status(404).json({ error: 'Owner user not found.' });
    return;
  }

  const workspaceId = `w-${Date.now()}`;
  const projectId = `p-${Date.now()}`;
  const workspaceKeyValue = normalizeEntityKey(key);
  const projectKey = normalizeEntityKey(defaultProjectKey || workspaceKeyValue);
  const resolvedWorkspaceAccessKey = typeof workspaceKey === 'string' && workspaceKey.trim().length > 0
    ? workspaceKey.trim()
    : createWorkspaceAccessKey(workspaceKeyValue);
  const resolvedJoinMode = isJoinMode(joinMode) ? joinMode : 'approval_required';

  try {
    const createWorkspace = centralDb.transaction(() => {
      centralDb.prepare(`
        INSERT INTO workspaces (id, name, description, key, workspaceKey, defaultProjectId, hostUrl, createdBy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        workspaceId,
        name,
        description || '',
        workspaceKeyValue,
        resolvedWorkspaceAccessKey,
        projectId,
        typeof hostUrl === 'string' ? hostUrl.trim() : '',
        ownerId
      );

      centralDb.prepare(`
        INSERT INTO workspace_settings (workspaceId, hostUrl, joinMode, createdAt, updatedAt)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(workspaceId, typeof hostUrl === 'string' ? hostUrl.trim() : '', resolvedJoinMode);

      centralDb.prepare(`
        INSERT INTO workspace_members (workspaceId, userId, role)
        VALUES (?, ?, 'owner')
      `).run(workspaceId, ownerId);

      centralDb.prepare(`
        INSERT INTO projects (id, name, description, key, status, inviteCode, workspaceId)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        projectId,
        typeof defaultProjectName === 'string' && defaultProjectName.trim().length > 0 ? defaultProjectName.trim() : `${name} Core`,
        description || '',
        projectKey,
        'active',
        createProjectInviteCode(projectKey),
        workspaceId
      );

      centralDb.prepare(`
        INSERT INTO project_members (projectId, userId, role)
        VALUES (?, ?, 'owner')
      `).run(projectId, ownerId);

      getProjectDb(projectId);
    });

    createWorkspace();

    const workspace = getWorkspaceSummary(workspaceId);
    const defaultProject = centralDb.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    res.status(201).json({ workspace, defaultProject });
  } catch (e: any) {
    if (e.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'Workspace key or default project key already exists.' });
      return;
    }

    res.status(500).json({ error: e.message });
  }
});

app.get('/api/workspaces/:workspaceId', (req, res) => {
  const { workspaceId } = req.params;

  try {
    const workspace = getWorkspaceSummary(workspaceId);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }

    res.json(workspace);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/workspaces/:workspaceId/projects', (req, res) => {
  const { workspaceId } = req.params;

  try {
    res.json(getWorkspaceProjects(workspaceId));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/workspaces/:workspaceId/members', (req, res) => {
  const { workspaceId } = req.params;

  try {
    res.json(getWorkspaceMembers(workspaceId));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/workspaces/:workspaceId/settings', (req, res) => {
  const { workspaceId } = req.params;

  try {
    ensureWorkspaceSettingsRecord(workspaceId);
    const workspace = centralDb.prepare(`
      SELECT id, workspaceKey, key, defaultProjectId
      FROM workspaces
      WHERE id = ?
    `).get(workspaceId) as { id: string; workspaceKey: string; key: string; defaultProjectId: string | null } | undefined;

    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }

    const settings = centralDb.prepare(`
      SELECT workspaceId, hostUrl, joinMode, createdAt, updatedAt
      FROM workspace_settings
      WHERE workspaceId = ?
    `).get(workspaceId);

    res.json({ ...settings, workspaceKey: workspace.workspaceKey, key: workspace.key, defaultProjectId: workspace.defaultProjectId || null });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/workspaces/:workspaceId/settings', (req, res) => {
  const { workspaceId } = req.params;
  const updates = Object.fromEntries(
    Object.entries({ ...req.body }).filter(([field]) => allowedWorkspaceSettingsFields.has(field))
  );

  if ('joinMode' in updates && !isJoinMode(updates.joinMode)) {
    res.status(400).json({ error: 'Unsupported workspace join mode.' });
    return;
  }

  try {
    ensureWorkspaceSettingsRecord(workspaceId);

    const workspace = centralDb.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId) as any;
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }

    if ('defaultProjectId' in updates) {
      if (updates.defaultProjectId === null || updates.defaultProjectId === '') {
        updates.defaultProjectId = null;
      } else {
        const project = centralDb.prepare(`
          SELECT id
          FROM projects
          WHERE id = ? AND workspaceId = ?
        `).get(updates.defaultProjectId, workspaceId);

        if (!project) {
          res.status(400).json({ error: 'Default project must belong to this workspace.' });
          return;
        }
      }
    }

    if (updates.hostUrl !== undefined || updates.joinMode !== undefined) {
      const settingsFields: string[] = [];
      const settingsParams: unknown[] = [];

      if (typeof updates.hostUrl === 'string') {
        settingsFields.push('hostUrl = ?');
        settingsParams.push(updates.hostUrl.trim());
      }

      if (isJoinMode(updates.joinMode)) {
        settingsFields.push('joinMode = ?');
        settingsParams.push(updates.joinMode);
      }

      settingsFields.push('updatedAt = CURRENT_TIMESTAMP');
      settingsParams.push(workspaceId);

      centralDb.prepare(`
        UPDATE workspace_settings
        SET ${settingsFields.join(', ')}
        WHERE workspaceId = ?
      `).run(...settingsParams);
    }

    if (typeof updates.hostUrl === 'string' || typeof updates.workspaceKey === 'string' || 'defaultProjectId' in updates) {
      const workspaceFields: string[] = [];
      const workspaceParams: unknown[] = [];

      if (typeof updates.hostUrl === 'string') {
        workspaceFields.push('hostUrl = ?');
        workspaceParams.push(updates.hostUrl.trim());
      }

      if (typeof updates.workspaceKey === 'string' && updates.workspaceKey.trim().length > 0) {
        workspaceFields.push('workspaceKey = ?');
        workspaceParams.push(updates.workspaceKey.trim());
      }

      if ('defaultProjectId' in updates) {
        workspaceFields.push('defaultProjectId = ?');
        workspaceParams.push(updates.defaultProjectId ?? null);
      }

      if (workspaceFields.length > 0) {
        workspaceParams.push(workspaceId);
        centralDb.prepare(`
          UPDATE workspaces
          SET ${workspaceFields.join(', ')}
          WHERE id = ?
        `).run(...workspaceParams);
      }
    }

    const settings = centralDb.prepare(`
      SELECT ws.workspaceId, ws.hostUrl, ws.joinMode, ws.createdAt, ws.updatedAt, w.workspaceKey, w.key, w.defaultProjectId
      FROM workspace_settings ws
      JOIN workspaces w ON w.id = ws.workspaceId
      WHERE ws.workspaceId = ?
    `).get(workspaceId);

    res.json(settings);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/workspaces/:workspaceId/invites', (req, res) => {
  const { workspaceId } = req.params;

  try {
    const invites = centralDb.prepare(`
      SELECT
        wi.*,
        u.name AS createdByName,
        COUNT(DISTINCT wjr.id) AS pendingJoinRequestCount
      FROM workspace_invites wi
      JOIN users u ON u.id = wi.createdBy
      LEFT JOIN workspace_join_requests wjr ON wjr.inviteId = wi.id AND wjr.status = 'pending'
      WHERE wi.workspaceId = ?
      GROUP BY wi.id, u.name
      ORDER BY wi.createdAt DESC
    `).all(workspaceId);

    res.json(invites);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/workspaces/:workspaceId/invites', (req, res) => {
  const { workspaceId } = req.params;
  const { createdBy, label, expiresAt, maxUses } = req.body;

  if (!createdBy) {
    res.status(400).json({ error: 'createdBy is required.' });
    return;
  }

  try {
    const workspace = centralDb.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId) as any;
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }

    const membership = getWorkspaceAdminMembership(workspaceId, createdBy);
    if (!membership) {
      res.status(403).json({ error: 'Only workspace admins can create invite links.' });
      return;
    }

    const inviteId = `wi-${Date.now()}`;
    const code = createWorkspaceInviteCode(workspace.key);
    centralDb.prepare(`
      INSERT INTO workspace_invites (id, workspaceId, code, createdBy, label, expiresAt, maxUses)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      inviteId,
      workspaceId,
      code,
      createdBy,
      typeof label === 'string' ? label.trim() : '',
      expiresAt || null,
      Number.isFinite(maxUses) ? maxUses : null
    );

    const invite = centralDb.prepare('SELECT * FROM workspace_invites WHERE id = ?').get(inviteId);
    res.status(201).json(invite);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/workspaces/invites/:inviteCode/join-requests', (req, res) => {
  const { inviteCode } = req.params;
  const { userId, requesterName, requesterEmail, requesterAvatar, message } = req.body;

  try {
    const invite = centralDb.prepare(`
      SELECT wi.*, ws.joinMode
      FROM workspace_invites wi
      LEFT JOIN workspace_settings ws ON ws.workspaceId = wi.workspaceId
      WHERE wi.code = ?
    `).get(inviteCode) as any;

    if (!invite) {
      res.status(404).json({ error: 'Invite not found.' });
      return;
    }

    if (invite.revokedAt) {
      res.status(400).json({ error: 'Invite has been revoked.' });
      return;
    }

    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      res.status(400).json({ error: 'Invite has expired.' });
      return;
    }

    if (typeof invite.maxUses === 'number' && invite.useCount >= invite.maxUses) {
      res.status(400).json({ error: 'Invite has reached its maximum number of uses.' });
      return;
    }

    const knownUser = userId
      ? (centralDb.prepare('SELECT id, name, email, avatar FROM users WHERE id = ?').get(userId) as any)
      : null;

    const resolvedName = knownUser?.name || requesterName;
    const resolvedEmail = knownUser?.email || requesterEmail;
    const resolvedAvatar = knownUser?.avatar || requesterAvatar || null;

    if (!resolvedName || !resolvedEmail) {
      res.status(400).json({ error: 'Requester name and email are required.' });
      return;
    }

    if (knownUser) {
      const existingMember = centralDb.prepare(`
        SELECT * FROM workspace_members WHERE workspaceId = ? AND userId = ?
      `).get(invite.workspaceId, knownUser.id);

      if (existingMember) {
        res.status(400).json({ error: 'User is already a member of this workspace.' });
        return;
      }
    }

    const existingPending = centralDb.prepare(`
      SELECT *
      FROM workspace_join_requests
      WHERE workspaceId = ?
        AND requesterEmail = ?
        AND status = 'pending'
    `).get(invite.workspaceId, resolvedEmail);

    if (existingPending) {
      res.status(409).json({ error: 'There is already a pending join request for this user.' });
      return;
    }

    const requestId = `wjr-${Date.now()}`;
    const autoJoin = invite.joinMode === 'auto_join' && knownUser;

    const createJoinRequest = centralDb.transaction(() => {
      centralDb.prepare(`
        INSERT INTO workspace_join_requests (
          id,
          workspaceId,
          inviteId,
          requestingUserId,
          requesterName,
          requesterEmail,
          requesterAvatar,
          message,
          status,
          reviewedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        requestId,
        invite.workspaceId,
        invite.id,
        knownUser?.id || userId || null,
        resolvedName,
        resolvedEmail,
        resolvedAvatar,
        typeof message === 'string' ? message.trim() : '',
        autoJoin ? 'approved' : 'pending',
        autoJoin ? new Date().toISOString() : null
      );

      centralDb.prepare(`
        UPDATE workspace_invites
        SET useCount = useCount + 1
        WHERE id = ?
      `).run(invite.id);

      if (autoJoin && knownUser) {
        centralDb.prepare(`
          INSERT OR IGNORE INTO workspace_members (workspaceId, userId, role)
          VALUES (?, ?, 'member')
        `).run(invite.workspaceId, knownUser.id);

        mirrorUserToWorkspaceProjects(invite.workspaceId, knownUser.id, 'member');
      }
    });

    createJoinRequest();

    const joinRequest = centralDb.prepare('SELECT * FROM workspace_join_requests WHERE id = ?').get(requestId);
    res.status(201).json(joinRequest);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/workspaces/:workspaceId/join-requests', (req, res) => {
  const { workspaceId } = req.params;

  try {
    const requests = centralDb.prepare(`
      SELECT
        wjr.*,
        reviewer.name AS reviewedByName
      FROM workspace_join_requests wjr
      LEFT JOIN users reviewer ON reviewer.id = wjr.reviewedBy
      WHERE wjr.workspaceId = ?
      ORDER BY CASE WHEN wjr.status = 'pending' THEN 0 ELSE 1 END, wjr.createdAt DESC
    `).all(workspaceId);

    res.json(requests);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/workspaces/:workspaceId/join-requests/:requestId/approve', (req, res) => {
  const { workspaceId, requestId } = req.params;
  const { reviewerUserId, role } = req.body;

  if (!reviewerUserId) {
    res.status(400).json({ error: 'reviewerUserId is required.' });
    return;
  }

  try {
    const reviewerMembership = getWorkspaceAdminMembership(workspaceId, reviewerUserId);
    if (!reviewerMembership) {
      res.status(403).json({ error: 'Only workspace admins can approve join requests.' });
      return;
    }

    const joinRequest = centralDb.prepare(`
      SELECT *
      FROM workspace_join_requests
      WHERE id = ? AND workspaceId = ?
    `).get(requestId, workspaceId) as any;

    if (!joinRequest) {
      res.status(404).json({ error: 'Join request not found.' });
      return;
    }

    if (joinRequest.status !== 'pending') {
      res.status(400).json({ error: 'Join request has already been reviewed.' });
      return;
    }

    if (!joinRequest.requestingUserId) {
      res.status(400).json({ error: 'This join request does not yet map to a local user account.' });
      return;
    }

    const resolvedRole = typeof role === 'string' && role.trim().length > 0 ? role.trim() : 'member';

    const approveRequest = centralDb.transaction(() => {
      centralDb.prepare(`
        INSERT OR IGNORE INTO workspace_members (workspaceId, userId, role)
        VALUES (?, ?, ?)
      `).run(workspaceId, joinRequest.requestingUserId, resolvedRole);

      mirrorUserToWorkspaceProjects(workspaceId, joinRequest.requestingUserId, resolvedRole);

      centralDb.prepare(`
        UPDATE workspace_join_requests
        SET status = 'approved', reviewedBy = ?, reviewedAt = ?
        WHERE id = ?
      `).run(reviewerUserId, new Date().toISOString(), requestId);
    });

    approveRequest();

    const approved = centralDb.prepare('SELECT * FROM workspace_join_requests WHERE id = ?').get(requestId);
    res.json(approved);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/workspace-connections', (req, res) => {
  const userId = req.query.userId as string | undefined;
  if (!userId) {
    res.status(400).json({ error: 'userId is required.' });
    return;
  }

  try {
    const connections = centralDb.prepare(`
      SELECT *
      FROM workspace_connections
      WHERE userId = ?
      ORDER BY COALESCE(lastConnectedAt, createdAt) DESC
    `).all(userId);

    res.json(connections);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/workspaces/connect', (req, res) => {
  const { userId, workspaceId, workspaceKey, hostUrl, label } = req.body;

  if (!userId || !workspaceId || !workspaceKey) {
    res.status(400).json({ error: 'userId, workspaceId, and workspaceKey are required.' });
    return;
  }

  try {
    const workspace = centralDb.prepare(`
      SELECT w.*, COALESCE(ws.hostUrl, w.hostUrl, '') AS resolvedHostUrl
      FROM workspaces w
      LEFT JOIN workspace_settings ws ON ws.workspaceId = w.id
      WHERE w.id = ?
    `).get(workspaceId) as any;

    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }

    if (workspace.workspaceKey !== String(workspaceKey).trim()) {
      res.status(401).json({ error: 'Workspace key is invalid.' });
      return;
    }

    const membership = centralDb.prepare(`
      SELECT * FROM workspace_members WHERE workspaceId = ? AND userId = ?
    `).get(workspaceId, userId);

    if (!membership) {
      res.status(403).json({ error: 'User is not an approved member of this workspace.' });
      return;
    }

    const existingConnection = centralDb.prepare(`
      SELECT * FROM workspace_connections WHERE userId = ? AND remoteWorkspaceId = ?
    `).get(userId, workspaceId) as any;

    const connectionId = existingConnection?.id || `wc-${Date.now()}`;
    const effectiveHostUrl = typeof hostUrl === 'string' && hostUrl.trim().length > 0
      ? hostUrl.trim()
      : workspace.resolvedHostUrl;
    const connectionLabel = typeof label === 'string' && label.trim().length > 0
      ? label.trim()
      : `${workspace.name} (${workspace.key})`;

    centralDb.prepare(`
      INSERT INTO workspace_connections (
        id,
        userId,
        label,
        hostUrl,
        remoteWorkspaceId,
        remoteWorkspaceKeyHint,
        status,
        lastConnectedAt
      ) VALUES (?, ?, ?, ?, ?, ?, 'connected', CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        hostUrl = excluded.hostUrl,
        remoteWorkspaceId = excluded.remoteWorkspaceId,
        remoteWorkspaceKeyHint = excluded.remoteWorkspaceKeyHint,
        status = 'connected',
        lastConnectedAt = CURRENT_TIMESTAMP
    `).run(
      connectionId,
      userId,
      connectionLabel,
      effectiveHostUrl,
      workspaceId,
      String(workspaceKey).trim().slice(-4)
    );

    const connection = centralDb.prepare('SELECT * FROM workspace_connections WHERE id = ?').get(connectionId);
    res.json({
      success: true,
      connection,
      workspace: getWorkspaceSummary(workspaceId),
      projects: getWorkspaceProjects(workspaceId),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------
// 4. Project & Tenant-Specific REST Endpoints
// ----------------------------------------------------

// Get all tickets with optional filtering
app.get('/api/tickets', (req, res) => {
  const { status, priority, projectId, domainId, cycleId, assigneeId } = req.query;
  
  try {
    const pdb = getDb(req);
    let query = 'SELECT * FROM tickets WHERE 1=1';
    const sqlParams: any[] = [];

    if (status) {
      query += ' AND status = ?';
      sqlParams.push(status);
    }
    if (priority) {
      query += ' AND priority = ?';
      sqlParams.push(priority);
    }
    if (domainId) {
      query += ' AND domainId = ?';
      sqlParams.push(domainId);
    }
    if (cycleId) {
      query += ' AND cycleId = ?';
      sqlParams.push(cycleId);
    }
    if (assigneeId) {
      query += ' AND assigneeId = ?';
      sqlParams.push(assigneeId);
    }

    query += ' ORDER BY createdAt DESC';
    const tickets = pdb.prepare(query).all(...sqlParams);
    res.json(tickets);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get detailed ticket by ID
app.get('/api/tickets/:id', (req, res) => {
  const { id } = req.params;
  try {
    const pdb = getDb(req);
    const ticket = pdb.prepare('SELECT * FROM tickets WHERE id = ? OR key = ?').get(id, id.toUpperCase()) as any;
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found.' });
      return;
    }
    const comments = pdb.prepare(`
      SELECT comments.*, central.users.name as userName, central.users.avatar as userAvatar 
      FROM comments 
      JOIN central.users ON comments.userId = central.users.id 
      WHERE ticketId = ? 
      ORDER BY createdAt ASC
    `).all(ticket.id);
    
    const subTickets = pdb.prepare('SELECT * FROM tickets WHERE parentId = ?').all(ticket.id);

    res.json({ ...ticket, comments, subTickets });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Create new ticket
app.post('/api/tickets', (req, res) => {
  const { title, description, status, priority, projectId, domainId, cycleId, assigneeId, parentId } = req.body;
  if (!title || !projectId) {
    res.status(400).json({ error: 'Title and projectId are required.' });
    return;
  }

  try {
    const project = centralDb.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    const pdb = getProjectDb(projectId);
    const countRow = pdb.prepare('SELECT COUNT(*) as count FROM tickets').get() as { count: number };
    const key = `${project.key}-${countRow.count + 1}`;
    const id = `t-${Date.now()}`;
    const now = new Date().toISOString();

    pdb.prepare(`
      INSERT INTO tickets (id, key, title, description, status, priority, assigneeId, projectId, domainId, cycleId, parentId, prStatus, prUrl, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, key, title, description || '', status || 'todo', priority || 'no_priority', assigneeId || null, projectId, domainId || null, cycleId || null, parentId || null, 'none', null, now, now);

    const ticket = pdb.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    
    // Broadcast change
    broadcastEvent('tickets-updated', { projectId, tickets: pdb.prepare('SELECT * FROM tickets').all() });

    res.status(201).json(ticket);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Update ticket
app.patch('/api/tickets/:id', (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body };
  delete updates.id;
  delete updates.key;

  try {
    const pdb = getDb(req);
    const ticket = pdb.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as any;
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found.' });
      return;
    }

    const fields: string[] = [];
    const sqlParams: any[] = [];

    Object.entries(updates).forEach(([field, val]) => {
      const finalVal = val === '' || val === 'null' ? null : val;
      fields.push(`${field} = ?`);
      sqlParams.push(finalVal);
    });

    if (fields.length === 0) {
      res.json(ticket);
      return;
    }

    const now = new Date().toISOString();
    fields.push('updatedAt = ?');
    sqlParams.push(now);
    sqlParams.push(id);

    pdb.prepare(`
      UPDATE tickets
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...sqlParams);

    const updated = pdb.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    
    // Broadcast change
    broadcastEvent('tickets-updated', { projectId: ticket.projectId, tickets: pdb.prepare('SELECT * FROM tickets').all() });

    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Delete ticket
app.delete('/api/tickets/:id', (req, res) => {
  const { id } = req.params;
  try {
    const pdb = getDb(req);
    const ticket = pdb.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as any;
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found.' });
      return;
    }

    pdb.prepare('DELETE FROM tickets WHERE id = ?').run(id);
    
    // Broadcast change
    broadcastEvent('tickets-updated', { projectId: ticket.projectId, tickets: pdb.prepare('SELECT * FROM tickets').all() });
    
    res.json({ success: true, message: 'Ticket deleted.' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Projects API
app.get('/api/projects', (req, res) => {
  const userId = req.query.userId as string;
  const workspaceId = req.query.workspaceId as string | undefined;

  try {
    let query = `
      SELECT DISTINCT p.*
      FROM projects p
      LEFT JOIN project_members pm ON pm.projectId = p.id
      LEFT JOIN workspace_members wm ON wm.workspaceId = p.workspaceId
      WHERE 1 = 1
    `;
    const sqlParams: string[] = [];

    if (userId) {
      query += ' AND (pm.userId = ? OR wm.userId = ?)';
      sqlParams.push(userId, userId);
    }

    if (workspaceId) {
      query += ' AND p.workspaceId = ?';
      sqlParams.push(workspaceId);
    }

    query += ' ORDER BY p.createdAt ASC';

    res.json(centralDb.prepare(query).all(...sqlParams));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/projects', (req, res) => {
  const { name, description, key, status, ownerId, workspaceId, workspaceKey, workspaceName } = req.body;
  if (!name || !key) {
    res.status(400).json({ error: 'Project name and key are required.' });
    return;
  }

  const id = `p-${Date.now()}`;
  const inviteCode = createProjectInviteCode(key);

  try {
    const normalizedProjectKey = normalizeEntityKey(key);
    const resolvedWorkspaceId = workspaceId || `w-${Date.now()}`;
    const normalizedWorkspaceKey = normalizeEntityKey(workspaceKey || key);

    const createProject = centralDb.transaction(() => {
      if (!workspaceId) {
        centralDb.prepare(`
          INSERT INTO workspaces (id, name, description, key, workspaceKey, defaultProjectId, hostUrl, createdBy)
          VALUES (?, ?, ?, ?, ?, ?, '', ?)
        `).run(
          resolvedWorkspaceId,
          workspaceName || name,
          description || '',
          normalizedWorkspaceKey,
          createWorkspaceAccessKey(normalizedWorkspaceKey),
          id,
          ownerId || null
        );

        centralDb.prepare(`
          INSERT INTO workspace_settings (workspaceId, hostUrl, joinMode, createdAt, updatedAt)
          VALUES (?, '', 'approval_required', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(resolvedWorkspaceId);

        if (ownerId) {
          centralDb.prepare(`
            INSERT OR IGNORE INTO workspace_members (workspaceId, userId, role)
            VALUES (?, ?, 'owner')
          `).run(resolvedWorkspaceId, ownerId);
        }
      } else {
        const existingWorkspace = centralDb.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId);
        if (!existingWorkspace) {
          throw new Error('Workspace not found.');
        }
      }

      centralDb.prepare(`
        INSERT INTO projects (id, name, description, key, status, inviteCode, workspaceId)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, name, description || '', normalizedProjectKey, status || 'planned', inviteCode, resolvedWorkspaceId);

      if (ownerId && !workspaceId) {
        centralDb.prepare(`
          INSERT OR IGNORE INTO project_members (projectId, userId, role)
          VALUES (?, ?, 'owner')
        `).run(id, ownerId);
      }

      centralDb.prepare(`
        UPDATE workspaces
        SET defaultProjectId = COALESCE(defaultProjectId, ?)
        WHERE id = ?
      `).run(id, resolvedWorkspaceId);

      mirrorWorkspaceMembersToProject(id, resolvedWorkspaceId);

      getProjectDb(id);
    });

    createProject();

    const newProj = centralDb.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    broadcastEvent('projects-updated', centralDb.prepare('SELECT * FROM projects').all());

    res.status(201).json(newProj);
  } catch (e: any) {
    if (e.message.includes('Workspace not found')) {
      res.status(404).json({ error: e.message });
      return;
    }

    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/projects/:projectId', (req, res) => {
  const { projectId } = req.params;
  const updates = Object.fromEntries(
    Object.entries({ ...req.body }).filter(([field]) => allowedProjectFields.has(field))
  );

  if ('status' in updates && !isProjectStatus(updates.status)) {
    res.status(400).json({ error: 'Unsupported project status.' });
    return;
  }

  try {
    const existingProject = centralDb.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!existingProject) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    const projectFields: string[] = [];
    const projectParams: unknown[] = [];

    if (typeof updates.name === 'string') {
      const normalizedName = updates.name.trim();
      if (!normalizedName) {
        res.status(400).json({ error: 'Project name is required.' });
        return;
      }

      projectFields.push('name = ?');
      projectParams.push(normalizedName);
    }

    if (typeof updates.description === 'string') {
      projectFields.push('description = ?');
      projectParams.push(updates.description.trim());
    }

    if (isProjectStatus(updates.status)) {
      projectFields.push('status = ?');
      projectParams.push(updates.status);
    }

    if (projectFields.length > 0) {
      projectParams.push(projectId);
      centralDb.prepare(`
        UPDATE projects
        SET ${projectFields.join(', ')}
        WHERE id = ?
      `).run(...projectParams);
    }

    const project = centralDb.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    broadcastEvent('projects-updated', centralDb.prepare('SELECT * FROM projects').all());
    res.json(project);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Project Invites Accept
app.post('/api/projects/invite/accept', (req, res) => {
  const { inviteCode, userId } = req.body;
  if (!inviteCode || !userId) {
    res.status(400).json({ error: 'Invite code and userId are required.' });
    return;
  }
  
  try {
    const project = centralDb.prepare('SELECT * FROM projects WHERE inviteCode = ?').get(inviteCode) as any;
    if (!project) {
      res.status(404).json({ error: 'Invalid invite code.' });
      return;
    }

    const joinProjectWorkspace = centralDb.transaction(() => {
      if (project.workspaceId) {
        centralDb.prepare(`
          INSERT OR IGNORE INTO workspace_members (workspaceId, userId, role)
          VALUES (?, ?, 'member')
        `).run(project.workspaceId, userId);

        mirrorUserToWorkspaceProjects(project.workspaceId, userId, 'member');
      } else {
        const exists = centralDb.prepare('SELECT * FROM project_members WHERE projectId = ? AND userId = ?').get(project.id, userId);
        if (!exists) {
          centralDb.prepare('INSERT INTO project_members (projectId, userId, role) VALUES (?, ?, ?)').run(project.id, userId, 'developer');
        }
      }
    });

    joinProjectWorkspace();
    
    const joinedProject = centralDb.prepare('SELECT * FROM projects WHERE id = ?').get(project.id);
    
    broadcastEvent('projects-updated', centralDb.prepare('SELECT * FROM projects').all());
    res.status(200).json({ success: true, project: joinedProject, message: `Successfully joined project ${project.name}!` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Manual Member Assignment
app.post('/api/projects/:projectId/members', (req, res) => {
  const { projectId } = req.params;
  const { userId, role } = req.body;
  if (!userId) {
    res.status(400).json({ error: 'UserId is required.' });
    return;
  }
  
  try {
    const userExists = centralDb.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!userExists) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const project = centralDb.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    
    const exists = centralDb.prepare('SELECT * FROM project_members WHERE projectId = ? AND userId = ?').get(projectId, userId);
    if (exists) {
      res.status(400).json({ error: 'User is already a member of this project.' });
      return;
    }

    const resolvedRole = role || 'developer';

    centralDb.prepare('INSERT INTO project_members (projectId, userId, role) VALUES (?, ?, ?)').run(projectId, userId, resolvedRole);

    if (project.workspaceId) {
      centralDb.prepare(`
        INSERT OR IGNORE INTO workspace_members (workspaceId, userId, role)
        VALUES (?, ?, ?)
      `).run(project.workspaceId, userId, resolvedRole === 'owner' ? 'owner' : 'member');
    }
    
    const allMembers = centralDb.prepare(`
      SELECT u.id, u.name, u.email, u.avatar, pm.role FROM users u
      JOIN project_members pm ON u.id = pm.userId
      WHERE pm.projectId = ?
    `).all(projectId);
    
    res.status(200).json({ success: true, members: allMembers });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Dynamic Domains Creation & Listing
app.get('/api/domains', (req, res) => {
  try {
    const pdb = getDb(req);
    res.json(pdb.prepare('SELECT * FROM domains').all());
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/domains', (req, res) => {
  const { name, color } = req.body;
  if (!name || !color) {
    res.status(400).json({ error: 'Name and color are required.' });
    return;
  }
  
  try {
    const pdb = getDb(req);
    const id = `d-${Date.now()}`;
    pdb.prepare('INSERT INTO domains (id, name, color) VALUES (?, ?, ?)').run(id, name, color);
    
    const newDomain = pdb.prepare('SELECT * FROM domains WHERE id = ?').get(id);
    const projectId = req.headers['x-project-id'] || req.query.projectId || req.body.projectId;
    broadcastEvent('domains-updated', { projectId, domains: pdb.prepare('SELECT * FROM domains').all() });
    
    res.status(201).json(newDomain);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Dynamic Cycles Creation & Listing
app.get('/api/cycles', (req, res) => {
  try {
    const pdb = getDb(req);
    res.json(pdb.prepare('SELECT * FROM cycles').all());
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/cycles', (req, res) => {
  const { name, startDate, endDate } = req.body;
  if (!name || !startDate || !endDate) {
    res.status(400).json({ error: 'Name, startDate, and endDate are required.' });
    return;
  }
  
  try {
    const pdb = getDb(req);
    const id = `c-${Date.now()}`;
    pdb.prepare('INSERT INTO cycles (id, name, startDate, endDate, completed) VALUES (?, ?, ?, ?, 0)').run(id, name, startDate, endDate);
    
    const newCycle = pdb.prepare('SELECT * FROM cycles WHERE id = ?').get(id);
    const projectId = req.headers['x-project-id'] || req.query.projectId || req.body.projectId;
    broadcastEvent('cycles-updated', { projectId, cycles: pdb.prepare('SELECT * FROM cycles').all() });
    
    res.status(201).json(newCycle);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Users List
app.get('/api/users', (req, res) => {
  const { projectId } = req.query;
  try {
    if (projectId) {
      res.json(centralDb.prepare(`
        SELECT u.id, u.name, u.email, u.avatar, pm.role 
        FROM users u
        JOIN project_members pm ON u.id = pm.userId
        WHERE pm.projectId = ?
      `).all(projectId));
    } else {
      res.json(centralDb.prepare('SELECT id, name, email, avatar, role, tutorial_completed FROM users').all());
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Comments API
app.get('/api/tickets/:id/comments', (req, res) => {
  const { id } = req.params;
  try {
    const pdb = getDb(req);
    const comments = pdb.prepare(`
      SELECT comments.*, central.users.name as userName, central.users.avatar as userAvatar 
      FROM comments 
      JOIN central.users ON comments.userId = central.users.id 
      WHERE ticketId = ? 
      ORDER BY createdAt ASC
    `).all(id);
    res.json(comments);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tickets/:id/comments', (req, res) => {
  const { id } = req.params;
  const { userId, body } = req.body;
  if (!userId || !body) {
    res.status(400).json({ error: 'userId and body are required.' });
    return;
  }

  try {
    const pdb = getDb(req);
    const commentId = `co-${Date.now()}`;
    const now = new Date().toISOString();

    pdb.prepare(`
      INSERT INTO comments (id, ticketId, userId, body, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(commentId, id, userId, body, now);

    const created = pdb.prepare(`
      SELECT comments.*, central.users.name as userName, central.users.avatar as userAvatar 
      FROM comments 
      JOIN central.users ON comments.userId = central.users.id 
      WHERE comments.id = ?
    `).get(commentId);

    // Narrowed Broadcast to prevent comments flashing other tickets' states
    const ticketComments = pdb.prepare(`
      SELECT comments.*, central.users.name as userName, central.users.avatar as userAvatar 
      FROM comments 
      JOIN central.users ON comments.userId = central.users.id 
      WHERE ticketId = ? 
      ORDER BY createdAt ASC
    `).all(id);
    broadcastEvent('comments-updated', { ticketId: id, comments: ticketComments });

    res.status(201).json(created);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------
// 4. GitHub Webhook receiver & SSE Live Stream
// ----------------------------------------------------
app.get('/api/events/subscribe', subscribeToEvents);
app.post('/api/webhooks/github', handleGithubWebhook);

// ----------------------------------------------------
// 5. Model Context Protocol (MCP) over SSE Endpoints
// ----------------------------------------------------
app.post('/api/mcp/sse', async (req, res) => {
  try {
    const response = await handleMcpRequest(req.body);
    res.json(response);
  } catch (e: any) {
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: { code: -32603, message: e.message }
    });
  }
});

// ----------------------------------------------------
// 6. Local Ollama proxy router (Extended Timeout)
// ----------------------------------------------------
app.post('/api/ai/chat', async (req, res) => {
  const { ollamaUrl, model, messages } = req.body;
  const targetUrl = ollamaUrl || 'http://localhost:11434';
  
  console.log(`AI Proxy forwarding chat request to Ollama: URL=${targetUrl}, model=${model}`);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000); // Extended 60 second timeout for CPU-only execution

    const response = await fetch(`${targetUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'llama3',
        messages: messages || [],
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: `Ollama service error: ${errorText}` });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (e: any) {
    res.status(502).json({ 
      error: `Could not connect to Ollama. Make sure Ollama is running locally on '${targetUrl}'. Error: ${e.message}` 
    });
  }
});

// Serve compiled static Vite front-end assets in production
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// Fallback all non-API GET routes to index.html for Single Page Application routing
app.get('/*splat', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

// Listen on all network interfaces
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`Gravity API Server running on port ${PORT}`);
  console.log(`Live Event SSE stream: http://localhost:${PORT}/api/events/subscribe`);
  console.log(`GitHub Webhook listener: http://localhost:${PORT}/api/webhooks/github`);
  console.log(`Web/SSE MCP endpoint: http://localhost:${PORT}/api/mcp/sse`);
  console.log(`========================================`);
});
