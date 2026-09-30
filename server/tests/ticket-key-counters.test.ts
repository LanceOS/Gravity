import { describe, expect, it } from 'vitest';
import { pool } from '../src/db/index.js';
import { migrateTicketKeyCounters } from '../src/db/ticket-key-counters.js';
import { createTicketRecord, deleteTicketRecord } from '../src/modules/tickets/services/tickets.js';
import { seedTicket, seedWorkspaceFixture } from './helpers/test-helpers.js';

describe('durable ticket numbers', () => {
  it('never reuses the highest deleted key, including after a repeated backfill', async () => {
    const { project } = await seedWorkspaceFixture();
    const first = await createTicketRecord({ projectId: project.id, title: 'First' });
    const second = await createTicketRecord({ projectId: project.id, title: 'Second' });
    expect([first.key, second.key]).toEqual(['GRV-1', 'GRV-2']);
    await deleteTicketRecord(second.id, project.id);
    await migrateTicketKeyCounters(pool, true);
    expect((await createTicketRecord({ projectId: project.id, title: 'Third' })).key).toBe('GRV-3');
  });

  it('backfills by key prefix, independently of current project and malformed keys', async () => {
    const { project } = await seedWorkspaceFixture();
    await seedTicket(project.id, { id: 'legacy', key: 'GRV-80' });
    await seedTicket(project.id, { id: 'moved', key: 'OTHER-PREFIX-900' });
    await seedTicket(project.id, { id: 'empty-prefix', key: '-17' });
    await seedTicket(project.id, { id: 'malformed', key: 'GRV-not-a-number' });
    await pool.query('DELETE FROM ticket_key_counters'); // Simulate pre-upgrade fixtures.
    await migrateTicketKeyCounters(pool, true);
    expect((await createTicketRecord({ projectId: project.id, title: 'After upgrade' })).key).toBe('GRV-81');
    expect((await pool.query("SELECT last_value FROM ticket_key_counters WHERE prefix = 'OTHER-PREFIX'")).rows[0].last_value).toBe(900);
    expect((await pool.query("SELECT last_value FROM ticket_key_counters WHERE prefix = ''")).rows[0].last_value).toBe(17);
  });
});
