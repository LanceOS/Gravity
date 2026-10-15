import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { env } from '../../../env.js';
import { noteMetadata } from '../schema.js';
import { NotesRepository } from '../repositories.js';
import { noteSearchText } from '../search-text.js';

/** Resume on every startup; compare the captured immutable revision before writing. */
export async function backfillNoteSearchIndex(batchSize = 100): Promise<number> {
  let cursor = '';
  let indexed = 0;
  let raced = false;
  for (;;) {
    const rows = await db.select({
      id: noteMetadata.id, version: noteMetadata.version,
      bucketPath: noteMetadata.bucketPath, bodyKey: noteMetadata.bodyKey,
    }).from(noteMetadata).where(and(isNull(noteMetadata.searchText), gt(noteMetadata.id, cursor)))
      .orderBy(asc(noteMetadata.id)).limit(batchSize);
    if (!rows.length) {
      if (!raced) return indexed;
      cursor = '';
      raced = false;
      continue;
    }
    for (const row of rows) {
      cursor = row.id;
      let body: string;
      try {
        body = await NotesRepository.getBody(row.bucketPath, row.bodyKey);
      } catch (error: any) {
        if (error.code !== 'ENOENT' || row.bodyKey !== 'body.md') throw error;
        body = '';
      }
      const searchText = noteSearchText(body);
      const values: Record<string, unknown> = { searchText };
      if (!env.databaseUrl.startsWith('pgmem://')) {
        values.searchVector = sql`setweight(to_tsvector('english', ${noteMetadata.title}), 'A') || setweight(to_tsvector('english', ${searchText}), 'B')`;
      }
      const changed = await db.update(noteMetadata).set(values)
        .where(and(eq(noteMetadata.id, row.id), eq(noteMetadata.version, row.version),
          eq(noteMetadata.bodyKey, row.bodyKey), isNull(noteMetadata.searchText)))
        .returning({ id: noteMetadata.id });
      indexed += changed.length;
      if (!changed.length) raced = true;
    }
  }
}

/** Keep transient storage failures from taking down the API; retry from null rows. */
export function startNoteSearchBackfill(retryDelayMs = 60_000): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    if (stopped) return;
    try {
      await backfillNoteSearchIndex();
    } catch (error) {
      if (stopped) return;
      console.error('Note search backfill deferred; retrying after storage or database recovery', {
        code: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown',
      });
      timer = setTimeout(() => { void run(); }, retryDelayMs);
      timer.unref();
    }
  };
  void run();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
