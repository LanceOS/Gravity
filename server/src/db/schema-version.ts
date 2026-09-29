import type { Pool } from 'pg';
import { beginServerInitialization, completeServerInitialization } from '../lib/server-lifecycle.js';

// Bump whenever the bootstrapped schema contract changes. This is separate from
// Drizzle's SQL journal: production currently applies schema through bootstrap.
export const REQUIRED_SCHEMA_VERSION = 1;

export async function initializeSchema(pool: Pick<Pool, 'query'>, migrate: () => Promise<void>) {
  beginServerInitialization();
  await pool.query(`CREATE TABLE IF NOT EXISTS gravity_schema_version (
    id INTEGER PRIMARY KEY, version INTEGER NOT NULL, ready BOOLEAN NOT NULL
  )`);
  await pool.query(`INSERT INTO gravity_schema_version (id, version, ready) VALUES (1, $1, false)
    ON CONFLICT (id) DO UPDATE SET ready = false`, [REQUIRED_SCHEMA_VERSION]);
  await migrate();
  await pool.query('UPDATE gravity_schema_version SET version = $1, ready = true WHERE id = 1', [REQUIRED_SCHEMA_VERSION]);
  completeServerInitialization();
}
