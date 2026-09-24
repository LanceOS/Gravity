// Separate process fixture: seed an isolated in-memory DB, then use real startup.
import { initializeDatabase } from '../../src/db/bootstrap.js';
import { db } from '../../src/db/index.js';
import { workspaces, workspaceMembers, workspaceSettings, teams, projects } from '../../src/db/schema.js';
import { McpStdioServer } from '../../src/modules/mcp/stdio.js';

await initializeDatabase();
await db.insert(workspaces).values({ id: 'stdio-workspace', name: 'Stdio workspace', key: 'STD', workspaceKey: 'STD-TEST', createdBy: 'stdio-user' });
await db.insert(workspaceMembers).values({ workspaceId: 'stdio-workspace', userId: 'stdio-user', role: 'owner' });
await db.insert(workspaceSettings).values({ workspaceId: 'stdio-workspace' });
await db.insert(teams).values({ id: 'stdio-team', workspaceId: 'stdio-workspace', name: 'Stdio team' });
await db.insert(projects).values({ id: 'stdio-project', workspaceId: 'stdio-workspace', teamId: 'stdio-team', name: 'Stdio project', key: 'STD', inviteCode: 'STD-INVITE', createdBy: 'stdio-user' });
await new McpStdioServer().start();
