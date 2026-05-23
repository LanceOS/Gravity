import { db } from './src/db/index.js';
import { workspaceMemberActivity, authUsers, workspaces } from './src/db/schema.js';

export async function checkDb() {
  const users = await db.select().from(authUsers);
  console.log('Users:', users.map(u => ({ id: u.id, name: u.name })));

  const ws = await db.select().from(workspaces);
  console.log('Workspaces:', ws.map(w => ({ id: w.id, name: w.name })));

  const activities = await db.select().from(workspaceMemberActivity);
  console.log('Activities:', activities);

  return {
    users,
    workspaces: ws,
    activities,
  };
}
