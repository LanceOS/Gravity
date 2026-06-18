import { db } from './server/src/db/index.js';
import { sql } from 'drizzle-orm';

async function checkCycle(blockerId: string, blockedId: string) {
  const result = await db.execute(sql`
    WITH RECURSIVE bfs AS (
      SELECT blocked_ticket_id FROM ticket_relationships WHERE ticket_id = ${blockedId}
      UNION
      SELECT tr.blocked_ticket_id
      FROM ticket_relationships tr
      INNER JOIN bfs b ON tr.ticket_id = b.blocked_ticket_id
    )
    SELECT 1 FROM bfs WHERE blocked_ticket_id = ${blockerId} LIMIT 1;
  `);
  console.log("Cycle exists?", result.length > 0);
}

checkCycle('a', 'b').catch(console.error).then(() => process.exit(0));
