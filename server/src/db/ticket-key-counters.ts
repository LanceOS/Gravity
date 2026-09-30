import type { Pool } from 'pg';

export const CREATE_TICKET_KEY_COUNTERS = `
  CREATE TABLE IF NOT EXISTS ticket_key_counters (
    prefix TEXT PRIMARY KEY,
    last_value BIGINT NOT NULL
  )`;

export const BACKFILL_TICKET_KEY_COUNTERS = `
  INSERT INTO ticket_key_counters (prefix, last_value)
  SELECT substring(key from '^(.*)-[0-9]+$'),
         max(substring(key from '-([0-9]+)$')::bigint)
  FROM tickets WHERE key ~ '^.*-[0-9]+$'
  GROUP BY substring(key from '^(.*)-[0-9]+$')
  ON CONFLICT (prefix) DO UPDATE
    SET last_value = GREATEST(ticket_key_counters.last_value, EXCLUDED.last_value)`;

// Preserve explicit keys from seed/import writes as well as allocated keys.
// Ticket deletion never touches this table. The trigger also retains the old
// prefix's high water mark when an explicit key is changed. Reserve before
// inserting/updating the unique ticket key so imports cannot invert the
// allocator's counter-before-ticket-row lock order. No writes to tickets here,
// so this trigger cannot recurse.
export const INSTALL_TICKET_KEY_COUNTER_TRIGGER = `
  CREATE OR REPLACE FUNCTION reserve_ticket_key_number() RETURNS trigger AS $$
  DECLARE key_prefix TEXT; key_number BIGINT;
  BEGIN
    IF NEW.key ~ '^.*-[0-9]+$' THEN
      key_prefix := substring(NEW.key from '^(.*)-[0-9]+$');
      key_number := substring(NEW.key from '-([0-9]+)$')::bigint;
      INSERT INTO ticket_key_counters (prefix, last_value) VALUES (key_prefix, key_number)
      ON CONFLICT (prefix) DO UPDATE
        SET last_value = GREATEST(ticket_key_counters.last_value, EXCLUDED.last_value);
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  DROP TRIGGER IF EXISTS tickets_reserve_key_number ON tickets;
  CREATE TRIGGER tickets_reserve_key_number BEFORE INSERT OR UPDATE OF key ON tickets
    FOR EACH ROW EXECUTE FUNCTION reserve_ticket_key_number();
`;

/** Run before serving writes. Lock out legacy inserts during backfill/install. */
export async function migrateTicketKeyCounters(pool: Pool, inMemory = false) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!inMemory) await client.query('LOCK TABLE tickets IN SHARE ROW EXCLUSIVE MODE');
    // pg-mem cannot plan CREATE TABLE IF NOT EXISTS with constraints when the
    // table already exists. Keep its compatibility branch out of production.
    const existsInMemory = inMemory && (await client.query(`SELECT 1 FROM information_schema.tables
      WHERE table_name = 'ticket_key_counters' AND table_schema = 'public'`)).rowCount;
    if (!existsInMemory) await client.query(CREATE_TICKET_KEY_COUNTERS);
    if (inMemory) {
      // pg-mem has no PL/pgSQL triggers or substring(regex). Production always
      // uses the SQL migration above; PostgreSQL tests exercise that path.
      const { rows } = await client.query('SELECT key FROM tickets');
      const maxima = new Map<string, bigint>();
      for (const { key } of rows) {
        const match = /^([\s\S]*)-([0-9]+)$/.exec(key);
        if (!match) continue;
        const value = BigInt(match[2]);
        if (value > (maxima.get(match[1]) ?? -1n)) maxima.set(match[1], value);
      }
      for (const [prefix, value] of maxima) {
        await client.query(`INSERT INTO ticket_key_counters (prefix, last_value) VALUES ($1, $2)
          ON CONFLICT (prefix) DO UPDATE SET last_value = GREATEST(ticket_key_counters.last_value, EXCLUDED.last_value)`,
          [prefix, value.toString()]);
      }
    } else {
      await client.query(BACKFILL_TICKET_KEY_COUNTERS);
      await client.query(INSTALL_TICKET_KEY_COUNTER_TRIGGER);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
