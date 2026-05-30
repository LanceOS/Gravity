import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env.js';
import * as schema from './schema.js';

async function createPool() {
  if (env.databaseUrl.startsWith('pgmem://')) {
    const { DataType, newDb } = await import('pg-mem');
    const memoryDb = newDb({ autoCreateForeignKeyIndices: true });

    memoryDb.public.interceptQueries((query) => {
      if (query.includes('from "pg_catalog"."pg_attribute" as "a"') && query.includes('kysely_migration')) {
        return [];
      }

      const normalizedQuery = query.trim().toLowerCase();
      if (normalizedQuery.startsWith('create index ') || normalizedQuery.startsWith('create unique index ')) {
        return [];
      }

      return null;
    });

    memoryDb.public.registerOperator({
      operator: '~' as never,
      left: DataType.text,
      right: DataType.text,
      returns: DataType.bool,
      implementation: (value: string, pattern: string) => new RegExp(pattern).test(value),
    });

    memoryDb.public.registerOperator({
      operator: '!~' as never,
      left: DataType.text,
      right: DataType.text,
      returns: DataType.bool,
      implementation: (value: string, pattern: string) => !new RegExp(pattern).test(value),
    });

    memoryDb.public.registerFunction({
      name: 'has_schema_privilege',
      args: [DataType.text, DataType.text],
      returns: DataType.bool,
      implementation: () => true,
    });

    memoryDb.public.registerFunction({
      name: 'col_description',
      args: [DataType.integer, DataType.integer],
      returns: DataType.text,
      implementation: () => null,
    });

    memoryDb.public.registerFunction({
      name: 'pg_get_serial_sequence',
      args: [DataType.text, DataType.text],
      returns: DataType.text,
      implementation: () => null,
    });

    const adapter = memoryDb.adapters.createPg();
    const patchQuery = (prototype: { query?: (...args: unknown[]) => unknown }) => {
      if (!prototype.query) {
        return;
      }

      const originalQuery = prototype.query;
      prototype.query = function patchedQuery(query: unknown, ...args: unknown[]) {
        const wantsArrayRowMode =
          query && typeof query === 'object' && !Array.isArray(query) && (query as Record<string, unknown>).rowMode === 'array';
        const normalizedQuery =
          query && typeof query === 'object' && !Array.isArray(query)
            ? {
                ...(query as Record<string, unknown>),
                rowMode: wantsArrayRowMode ? undefined : (query as Record<string, unknown>).rowMode,
                types: undefined,
              }
            : query;

        const queryResult = originalQuery.call(this, normalizedQuery, ...args);
        if (!wantsArrayRowMode || !queryResult || typeof (queryResult as Promise<unknown>).then !== 'function') {
          return queryResult;
        }

        return (queryResult as Promise<Record<string, unknown>>).then((result) => {
          const fieldNames = Array.isArray(result.fields)
            ? result.fields
                .map((field) => (field && typeof field === 'object' && 'name' in field ? String((field as { name: unknown }).name) : ''))
                .filter(Boolean)
            : [];

          const rows = Array.isArray(result.rows)
            ? result.rows.map((row) => {
                if (Array.isArray(row)) {
                  return row;
                }

                if (!row || typeof row !== 'object') {
                  return row;
                }

                const sourceRow = row as Record<string, unknown>;
                const orderedKeys = fieldNames.length > 0 ? fieldNames : Object.keys(sourceRow);
                return orderedKeys.map((key) => sourceRow[key]);
              })
            : result.rows;

          return {
            ...result,
            rows,
          };
        });
      };
    };

    patchQuery(adapter.Pool.prototype as { query?: (...args: unknown[]) => unknown });
    patchQuery(adapter.Client.prototype as { query?: (...args: unknown[]) => unknown });

    return new adapter.Pool() as unknown as Pool;
  }

  return new Pool({
    connectionString: env.databaseUrl,
  });
}

export const pool = await createPool();

// Handle unexpected errors on idle Postgres clients to avoid an unhandled
// 'error' event bringing down the whole Node process. When this happens we
// attempt to trigger a graceful shutdown by emitting SIGTERM so the main
// process handlers can clean up (HTTP server, redis, etc.).
if (pool && typeof (pool as any).on === 'function') {
  (pool as any).on('error', (err: unknown) => {
    try {
      console.error('Unexpected Postgres client error:', err);
      // Emit SIGTERM which the app should handle and perform a graceful
      // shutdown. Using `process.emit` calls the registered listeners.
      // If no listener is present yet, the app will still have the error
      // logged and we preserve the process (avoid uncaught exception crash).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process as any).emit('SIGTERM');
    } catch (e) {
      console.error('Error while handling Postgres client error:', e);
    }
  });
}

export const db = drizzle(pool, { schema });