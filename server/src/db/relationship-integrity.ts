import { and, asc, eq, inArray, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from './index.js';
import { projects, ticketRelationships, tickets } from './schema.js';

const sourceTicket = alias(tickets, 'relationship_source_ticket');
const targetTicket = alias(tickets, 'relationship_target_ticket');
const sourceProject = alias(projects, 'relationship_source_project');
const targetProject = alias(projects, 'relationship_target_project');

/** Remove only relationships whose endpoint workspaces differ at deletion time. */
export async function removeCrossWorkspaceTicketRelationships(): Promise<number> {
  const candidates = await db.select({
    ticketId: ticketRelationships.ticketId,
    blockedTicketId: ticketRelationships.blockedTicketId,
    sourceProjectId: sourceTicket.projectId,
    targetProjectId: targetTicket.projectId,
  })
    .from(ticketRelationships)
    .innerJoin(sourceTicket, eq(sourceTicket.id, ticketRelationships.ticketId))
    .innerJoin(targetTicket, eq(targetTicket.id, ticketRelationships.blockedTicketId))
    .innerJoin(sourceProject, eq(sourceProject.id, sourceTicket.projectId))
    .innerJoin(targetProject, eq(targetProject.id, targetTicket.projectId))
    .where(ne(sourceProject.workspaceId, targetProject.workspaceId));

  let removed = 0;
  for (let offset = 0; offset < candidates.length; offset += 100) {
    const batch = candidates.slice(offset, offset + 100);
    removed += await db.transaction(async (tx) => {
      // Match dependency writes' lock order. Recheck under the locks so a row
      // that became valid after the initial scan cannot be removed.
      const projectIds = [...new Set(batch.flatMap((row) => [row.sourceProjectId, row.targetProjectId]))];
      const lockedProjects = await tx.select({ id: projects.id, workspaceId: projects.workspaceId })
        .from(projects).where(inArray(projects.id, projectIds))
        .orderBy(asc(projects.id)).for('update');
      const ticketIds = [...new Set(batch.flatMap((row) => [row.ticketId, row.blockedTicketId]))];
      const lockedTickets = await tx.select({ id: tickets.id, projectId: tickets.projectId })
        .from(tickets).where(inArray(tickets.id, ticketIds))
        .orderBy(asc(tickets.id)).for('update');
      const workspaceByProjectId = new Map(lockedProjects.map((row) => [row.id, row.workspaceId]));
      const projectByTicketId = new Map(lockedTickets.map((row) => [row.id, row.projectId]));
      const stillInvalid = batch.filter((row) =>
        projectByTicketId.get(row.ticketId) === row.sourceProjectId
        && projectByTicketId.get(row.blockedTicketId) === row.targetProjectId
        && workspaceByProjectId.get(row.sourceProjectId) !== undefined
        && workspaceByProjectId.get(row.targetProjectId) !== undefined
        && workspaceByProjectId.get(row.sourceProjectId) !== workspaceByProjectId.get(row.targetProjectId));
      if (stillInvalid.length === 0) return 0;
      const deleted = await tx.delete(ticketRelationships).where(or(...stillInvalid.map((row) => and(
        eq(ticketRelationships.ticketId, row.ticketId),
        eq(ticketRelationships.blockedTicketId, row.blockedTicketId),
      )))).returning({ ticketId: ticketRelationships.ticketId });
      return deleted.length;
    });
  }
  return removed;
}
