import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = process.env.DB_DIR ? path.resolve(process.env.DB_DIR) : __dirname;

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const centralDbPath = path.join(dbDir, 'gravity_central.db');
export const centralDb = new Database(centralDbPath);

centralDb.pragma('journal_mode = WAL');

const projectDbPool: Record<string, Database.Database> = {};

const tenantsDir = path.join(dbDir, 'tenants');
if (!fs.existsSync(tenantsDir)) {
  fs.mkdirSync(tenantsDir, { recursive: true });
}

function hasColumn(tableName: string, columnName: string) {
  const columns = centralDb.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

function getLegacyWorkspaceId(projectId: string) {
  return `w-${projectId}`;
}

function getLegacyWorkspaceAccessKey(projectKey: string, projectId: string) {
  return `WK-${projectKey.toUpperCase()}-${projectId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`;
}

function ensureWorkspaceSettings(workspaceId: string) {
  centralDb.prepare(`
    INSERT OR IGNORE INTO workspace_settings (
      workspaceId,
      hostUrl,
      joinMode,
      createdAt,
      updatedAt
    )
    VALUES (?, '', 'approval_required', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(workspaceId);
}

function backfillLegacyWorkspaces() {
  if (!hasColumn('projects', 'workspaceId')) {
    centralDb.exec("ALTER TABLE projects ADD COLUMN workspaceId TEXT");
  }

  const projects = centralDb.prepare(`
    SELECT
      p.id,
      p.name,
      p.description,
      p.key,
      p.workspaceId,
      (
        SELECT pm.userId
        FROM project_members pm
        WHERE pm.projectId = p.id
        ORDER BY CASE WHEN pm.role = 'owner' THEN 0 ELSE 1 END, pm.createdAt ASC
        LIMIT 1
      ) AS ownerId
    FROM projects p
  `).all() as Array<{
    id: string;
    name: string;
    description: string | null;
    key: string;
    workspaceId: string | null;
    ownerId: string | null;
  }>;

  const insertWorkspace = centralDb.prepare(`
    INSERT OR IGNORE INTO workspaces (
      id,
      name,
      description,
      key,
      workspaceKey,
      defaultProjectId,
      hostUrl,
      createdBy
    )
    VALUES (?, ?, ?, ?, ?, ?, '', ?)
  `);
  const updateWorkspaceDefaultProject = centralDb.prepare(`
    UPDATE workspaces
    SET defaultProjectId = COALESCE(defaultProjectId, ?)
    WHERE id = ?
  `);
  const updateProjectWorkspace = centralDb.prepare(`
    UPDATE projects
    SET workspaceId = ?
    WHERE id = ?
  `);
  const insertWorkspaceMember = centralDb.prepare(`
    INSERT OR IGNORE INTO workspace_members (workspaceId, userId, role)
    VALUES (?, ?, ?)
  `);
  const getProjectMembers = centralDb.prepare(`
    SELECT userId, role
    FROM project_members
    WHERE projectId = ?
  `);

  const migrateProject = centralDb.transaction((project: (typeof projects)[number]) => {
    const workspaceId = project.workspaceId || getLegacyWorkspaceId(project.id);

    insertWorkspace.run(
      workspaceId,
      project.name,
      project.description || '',
      project.key,
      getLegacyWorkspaceAccessKey(project.key, project.id),
      project.id,
      project.ownerId
    );
    updateWorkspaceDefaultProject.run(project.id, workspaceId);
    updateProjectWorkspace.run(workspaceId, project.id);
    ensureWorkspaceSettings(workspaceId);

    const members = getProjectMembers.all(project.id) as Array<{ userId: string; role: string }>;
    members.forEach((member) => {
      insertWorkspaceMember.run(workspaceId, member.userId, member.role);
    });
  });

  projects.forEach((project) => migrateProject(project));
}

export function initCentralDB() {
  centralDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      avatar TEXT,
      role TEXT DEFAULT 'developer',
      password TEXT NOT NULL,
      tutorial_completed INTEGER CHECK(tutorial_completed IN (0, 1)) DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      key TEXT UNIQUE NOT NULL,
      status TEXT CHECK(status IN ('planned', 'active', 'completed')) DEFAULT 'planned',
      inviteCode TEXT UNIQUE NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      key TEXT UNIQUE NOT NULL,
      workspaceKey TEXT NOT NULL,
      defaultProjectId TEXT,
      hostUrl TEXT DEFAULT '',
      createdBy TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      workspaceId TEXT NOT NULL,
      userId TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspaceId, userId),
      FOREIGN KEY(workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workspace_settings (
      workspaceId TEXT PRIMARY KEY,
      hostUrl TEXT DEFAULT '',
      joinMode TEXT CHECK(joinMode IN ('approval_required', 'auto_join')) DEFAULT 'approval_required',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workspace_invites (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      createdBy TEXT NOT NULL,
      label TEXT DEFAULT '',
      expiresAt DATETIME,
      revokedAt DATETIME,
      maxUses INTEGER,
      useCount INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workspace_join_requests (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      inviteId TEXT,
      requestingUserId TEXT,
      requesterName TEXT NOT NULL,
      requesterEmail TEXT NOT NULL,
      requesterAvatar TEXT,
      message TEXT DEFAULT '',
      status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
      reviewedBy TEXT,
      reviewedAt DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(inviteId) REFERENCES workspace_invites(id) ON DELETE SET NULL,
      FOREIGN KEY(reviewedBy) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_connections (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      label TEXT NOT NULL,
      hostUrl TEXT NOT NULL,
      remoteWorkspaceId TEXT,
      remoteWorkspaceKeyHint TEXT DEFAULT '',
      status TEXT CHECK(status IN ('saved', 'connected', 'pending')) DEFAULT 'saved',
      lastConnectedAt DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_members (
      projectId TEXT NOT NULL,
      userId TEXT NOT NULL,
      role TEXT DEFAULT 'developer',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (projectId, userId),
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      userId TEXT PRIMARY KEY,
      defaultView TEXT CHECK(defaultView IN ('list', 'board')) DEFAULT 'board',
      ollamaModel TEXT DEFAULT '',
      ollamaEndpoint TEXT DEFAULT 'http://localhost:11434',
      theme TEXT CHECK(theme IN ('dark', 'light')) DEFAULT 'dark',
      apiKey TEXT,
      aiProvider TEXT DEFAULT 'openai',
      projectLayout TEXT DEFAULT 'standard',
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const userSettingsColumns = centralDb
    .prepare('PRAGMA table_info(user_settings)')
    .all() as Array<{ name: string }>;

  if (!userSettingsColumns.some((column) => column.name === 'aiProvider')) {
    centralDb.exec("ALTER TABLE user_settings ADD COLUMN aiProvider TEXT DEFAULT 'openai'");
  }

  backfillLegacyWorkspaces();
}

export function initProjectDB(projectDb: Database.Database) {
  projectDb.exec(`
    CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cycles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      startDate DATETIME NOT NULL,
      endDate DATETIME NOT NULL,
      completed INTEGER CHECK(completed IN (0, 1)) DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT CHECK(status IN ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled')) DEFAULT 'todo',
      priority TEXT CHECK(priority IN ('no_priority', 'low', 'medium', 'high', 'urgent')) DEFAULT 'no_priority',
      assigneeId TEXT,
      projectId TEXT,
      domainId TEXT,
      cycleId TEXT,
      parentId TEXT,
      prStatus TEXT CHECK(prStatus IN ('open', 'merged', 'closed', 'none')) DEFAULT 'none',
      prUrl TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(domainId) REFERENCES domains(id),
      FOREIGN KEY(cycleId) REFERENCES cycles(id),
      FOREIGN KEY(parentId) REFERENCES tickets(id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      ticketId TEXT NOT NULL,
      userId TEXT NOT NULL,
      body TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(ticketId) REFERENCES tickets(id) ON DELETE CASCADE
    );
  `);
}

export function getProjectDb(projectId: string): Database.Database {
  if (projectDbPool[projectId]) {
    return projectDbPool[projectId];
  }

  const projectDbPath = path.join(tenantsDir, `project_${projectId}.db`);
  const projectDb = new Database(projectDbPath);

  projectDb.pragma('journal_mode = WAL');

  const escapedCentralDbPath = centralDbPath.replace(/'/g, "''");
  projectDb.exec(`ATTACH DATABASE '${escapedCentralDbPath}' AS central`);

  initProjectDB(projectDb);

  projectDbPool[projectId] = projectDb;
  return projectDb;
}

process.on('exit', () => {
  centralDb.close();
  Object.values(projectDbPool).forEach((conn) => conn.close());
});

export default centralDb;
