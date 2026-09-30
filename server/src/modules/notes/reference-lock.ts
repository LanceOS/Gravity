import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { env } from '../../env.js';

export type NoteTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// pg-mem has no locks. This queue only makes isolated test interleavings model
// the production transaction boundary; it is never the production lock.
let testTail = Promise.resolve();

export async function withNoteReferenceLock<T>(work: (tx: NoteTransaction) => Promise<T>): Promise<T> {
  if (env.databaseUrl.startsWith('pgmem://')) {
    const previous = testTail;
    let release!: () => void;
    testTail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      return await db.transaction(work);
    } finally {
      release();
    }
  }
  return db.transaction(async tx => {
    // Bound contention, not total transaction duration: storage inventories run
    // while this lock is held. Durable claims for RPCs that outlive a lost
    // transaction, and orphan-cleanup coordination, remain GRAV-250 work.
    await tx.execute(sql`set local lock_timeout = '5s'`);
    // Cross-project references require a global mutation lock. Reads continue;
    // inserts/updates/deletes and other holders wait until this tx commits.
    await tx.execute(sql`lock table note_metadata in share row exclusive mode`);
    return work(tx);
  });
}
