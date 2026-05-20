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

function ensureUserSettings(userId: string) {
  centralDb.prepare(`
    INSERT OR IGNORE INTO user_settings (userId, defaultView, ollamaModel, ollamaEndpoint, theme, apiKey, aiProvider, projectLayout)
    VALUES (?, 'board', '', 'http://localhost:11434', 'dark', '', 'openai', 'standard')
  `).run(userId);
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
  const provider = isAIProvider(req.body?.provider) ? req.body.provider : 'openai';
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
// 3. Project & Tenant-Specific REST Endpoints
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
  if (userId) {
    res.json(centralDb.prepare(`
      SELECT p.* FROM projects p
      JOIN project_members pm ON p.id = pm.projectId
      WHERE pm.userId = ?
    `).all(userId));
  } else {
    res.json(centralDb.prepare('SELECT * FROM projects').all());
  }
});

app.post('/api/projects', (req, res) => {
  const { name, description, key, status, ownerId } = req.body;
  if (!name || !key) {
    res.status(400).json({ error: 'Project name and key are required.' });
    return;
  }
  
  const id = `p-${Date.now()}`;
  const inviteCode = `INV-${key.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  
  try {
    centralDb.prepare(`
      INSERT INTO projects (id, name, description, key, status, inviteCode)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, description || '', key.toUpperCase(), status || 'planned', inviteCode);
    
    if (ownerId) {
      centralDb.prepare('INSERT INTO project_members (projectId, userId, role) VALUES (?, ?, ?)')
        .run(id, ownerId, 'owner');
    }
    
    // Trigger dynamic project DB creation and seeding
    getProjectDb(id);
    
    const newProj = centralDb.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    broadcastEvent('projects-updated', centralDb.prepare('SELECT * FROM projects').all());
    
    res.status(201).json(newProj);
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
    
    // Check if member already
    const exists = centralDb.prepare('SELECT * FROM project_members WHERE projectId = ? AND userId = ?').get(project.id, userId);
    if (!exists) {
      centralDb.prepare('INSERT INTO project_members (projectId, userId, role) VALUES (?, ?, ?)').run(project.id, userId, 'developer');
    }
    
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
    
    const exists = centralDb.prepare('SELECT * FROM project_members WHERE projectId = ? AND userId = ?').get(projectId, userId);
    if (exists) {
      res.status(400).json({ error: 'User is already a member of this project.' });
      return;
    }
    
    centralDb.prepare('INSERT INTO project_members (projectId, userId, role) VALUES (?, ?, ?)').run(projectId, userId, role || 'developer');
    
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
