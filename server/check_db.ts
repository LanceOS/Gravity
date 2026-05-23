import { db } from './src/db/index.js';
import { workspaceMemberActivity, authUsers, workspaces } from './src/db/schema.js';

async function main() {
  const users = await db.select().from(authUsers);
  console.log('Users:', users.map(u => ({ id: u.id, name: u.name })));
  
  const ws = await db.select().from(workspaces);
  console.log('Workspaces:', ws.map(w => ({ id: w.id, name: w.name })));
  
  const activities = await db.select().from(workspaceMemberActivity);
  console.log('Activities:', activities);
  
  const wId = ws[0]?.id;
  const uId = users[0]?.id;
  if(wId && uId) {
    console.log('Testing insert...');
    try {
      await db.insert(workspaceMemberActivity).values({
        workspaceId: wId,
        userId: uId,
        lastActiveAt: new Date(),
      }).onConflictDoUpdate({
        target: [workspaceMemberActivity.workspaceId, workspaceMemberActivity.userId],
        set: { lastActiveAt: new Date() }
      });
      console.log('Insert successful');
    } catch(e) {
      console.error('Insert failed', e);
    }
  }
  
  process.exit(0);
}
main().catch(console.error);
