import { db } from './server/src/db/index.js';
import { tickets, ticketDependencies } from './server/src/db/schema.js';
import { createTicketDependencyRelation } from './server/src/modules/tickets/services/tickets.js';

async function run() {
  const allTix = await db.select().from(tickets).limit(2);
  if (allTix.length < 2) {
    console.log("Not enough tickets");
    process.exit(0);
  }
  const [t1, t2] = allTix;
  console.log(`T1: ${t1.id}, T2: ${t2.id}`);
  
  await createTicketDependencyRelation(t1.id, t2.id);
  console.log("Created relation.");
  
  const deps = await db.select().from(ticketDependencies).where(
    // eq is not imported, let's just query all
  );
}

run().catch(console.error).finally(() => process.exit(0));
