import type { Ticket } from '../../types/domain';
import { hasEquivalentTicketFields } from '../shared';

export function createTicketMap(tickets: Ticket[]): Map<string, Ticket> {
  const map = new Map<string, Ticket>();

  for (const ticket of tickets) {
    map.set(ticket.key.toUpperCase(), ticket);
  }

  return map;
}

export function createTicketByIdMap(tickets: Ticket[]): Map<string, Ticket> {
  const map = new Map<string, Ticket>();

  for (const ticket of tickets) {
    map.set(ticket.id, ticket);
  }

  return map;
}

export function createTicketsByProjectMap(tickets: Ticket[]): Map<string, Ticket[]> {
  const map = new Map<string, Ticket[]>();

  for (const ticket of tickets) {
    const current = map.get(ticket.projectId);
    if (current) {
      current.push(ticket);
      continue;
    }

    map.set(ticket.projectId, [ticket]);
  }

  return map;
}

export function createTicketsByParentMap(tickets: Ticket[]): Map<string, Ticket[]> {
  const map = new Map<string, Ticket[]>();

  for (const ticket of tickets) {
    if (!ticket.parentId) {
      continue;
    }

    const current = map.get(ticket.parentId);
    if (current) {
      current.push(ticket);
      continue;
    }

    map.set(ticket.parentId, [ticket]);
  }

  return map;
}

export function resolveSyncedActiveTicket(
  activeTicket: Ticket | null,
  ticketById: Map<string, Ticket>,
): Ticket | null {
  if (!activeTicket) {
    return null;
  }

  const latest = ticketById.get(activeTicket.id);
  if (!latest) {
    return null;
  }

  if (hasEquivalentTicketFields(latest, activeTicket)) {
    return null;
  }

  return latest;
}
