process.env.DATABASE_URL = 'postgresql://gravity_user:admin@localhost:5432/gravity_workspace';
process.env.REDIS_ENABLED = 'false';

import { db } from './db/index.js';
import { tickets, ticketRelationships } from './db/schema.js';
import { listTickets } from './modules/tickets/services/tickets.js';

async function main() {
  console.log('--- Querying DB directly via listTickets ---');
  // Find a project first
  const projectRows = await db.select().from(tickets).limit(10);
  if (projectRows.length === 0) {
    console.log('No tickets in DB.');
    return;
  }
  
  const projectIds = Array.from(new Set(projectRows.map(r => r.projectId)));
  for (const projectId of projectIds) {
    const list = await listTickets(projectId);
    console.log(`Project ${projectId} has ${list.length} tickets:`);
    list.forEach(t => {
      console.log(`  Ticket Key: ${t.key}, isBlocked: ${t.isBlocked}, isDependency: ${t.isDependency}`);
    });
  }

  console.log('\n--- All Ticket Relationships in DB ---');
  const relations = await db.select().from(ticketRelationships);
  console.log(relations);
}

main().catch(err => {
  console.error(err);
});
