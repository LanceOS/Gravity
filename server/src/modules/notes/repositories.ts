import { and, desc, asc, eq, lt, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { noteBodyRevisions, noteMetadata } from './schema.js';
import { RustFS } from '../../lib/rustfs.js';
import { env } from '../../env.js';

export type NoteMetadata = typeof noteMetadata.$inferSelect;

export type NoteListItem = Pick<NoteMetadata, 'id' | 'title' | 'excerpt' | 'version' | 'createdAt' | 'updatedAt'>;

function buildSearchVector(title: string, excerpt: string) {
  return sql`to_tsvector('english', ${title} || ' ' || ${excerpt})`;
}

export class MetadataRepository {
  static async listNotesForMediaCleanup() {
    return db.select().from(noteMetadata);
  }

  /**
   * Creates a new note metadata record.
   */
  static async createNoteMetadata(data: {
    id: string;
    projectId: string;
    userId: string;
    title: string;
    excerpt?: string;
    bucketPath: string;
    bodyKey?: string;
  }): Promise<NoteMetadata> {
    const excerpt = data.excerpt || '';
    const useSearchVector = typeof env.databaseUrl === 'string' && !env.databaseUrl.startsWith('pgmem://');

    const insertValues: any = {
      id: data.id,
      projectId: data.projectId,
      userId: data.userId,
      title: data.title,
      excerpt,
      bucketPath: data.bucketPath,
      bodyKey: data.bodyKey,
    };

    if (useSearchVector) {
      // Only include search vector when running against a real Postgres instance
      // because pg-mem does not support the tsvector type and related functions.
      insertValues.searchVector = buildSearchVector(data.title, excerpt);
    }

    return commitRevision(data.bodyKey, data.bucketPath, async (tx) => {
      const [record] = await tx.insert(noteMetadata).values(insertValues).returning();
      return record;
    });
  }

  /**
   * Retrieves a note metadata record by ID.
   */
  static async getNoteMetadata(id: string): Promise<NoteMetadata | null> {
    const [record] = await db.select().from(noteMetadata).where(eq(noteMetadata.id, id)).limit(1);
    return record || null;
  }

  /**
   * Lists note metadata for a given project and user, with basic pagination.
   */
  static async listNotesMetadata(
    projectId: string,
    userId: string,
    limit: number = 20,
    offset: number = 0,
    sortDirection: 'desc' | 'asc' = 'desc'
  ): Promise<NoteListItem[]> {
    return await db
      .select({
        id: noteMetadata.id,
        title: noteMetadata.title,
        excerpt: noteMetadata.excerpt,
        version: noteMetadata.version,
        createdAt: noteMetadata.createdAt,
        updatedAt: noteMetadata.updatedAt,
      })
      .from(noteMetadata)
      .where(and(eq(noteMetadata.projectId, projectId), eq(noteMetadata.userId, userId)))
      .orderBy(sortDirection === 'desc' ? desc(noteMetadata.updatedAt) : asc(noteMetadata.updatedAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Searches note metadata for a given project and user using full-text search.
   */
  static async searchNotesMetadata(
    projectId: string,
    userId: string,
    query: string,
    limit: number = 20,
    offset: number = 0,
    sortDirection: 'desc' | 'asc' = 'desc'
  ): Promise<NoteListItem[]> {
    const useSearchVector = typeof env.databaseUrl === 'string' && !env.databaseUrl.startsWith('pgmem://');

    if (useSearchVector) {
      // We use websearch_to_tsquery for user-friendly query parsing when tsvector is available
      const tsQuery = sql`websearch_to_tsquery('english', ${query})`;

      return await db
        .select({
          id: noteMetadata.id,
          title: noteMetadata.title,
          excerpt: noteMetadata.excerpt,
          version: noteMetadata.version,
          createdAt: noteMetadata.createdAt,
          updatedAt: noteMetadata.updatedAt,
        })
        .from(noteMetadata)
        .where(
          and(
            eq(noteMetadata.projectId, projectId),
            eq(noteMetadata.userId, userId),
            sql`${noteMetadata.searchVector} @@ ${tsQuery}`
          )
        )
        .orderBy(desc(sql`ts_rank(${noteMetadata.searchVector}, ${tsQuery})`))
        .limit(limit)
        .offset(offset);
    }

    // Fallback for pg-mem or environments without tsvector: simple ILIKE on title/excerpt
    const likeQuery = `%${query}%`;
    return await db
      .select({
        id: noteMetadata.id,
        title: noteMetadata.title,
        excerpt: noteMetadata.excerpt,
        version: noteMetadata.version,
        createdAt: noteMetadata.createdAt,
        updatedAt: noteMetadata.updatedAt,
      })
      .from(noteMetadata)
      .where(
        and(
          eq(noteMetadata.projectId, projectId),
          eq(noteMetadata.userId, userId),
          sql`(${noteMetadata.title} ILIKE ${likeQuery} OR ${noteMetadata.excerpt} ILIKE ${likeQuery})`
        )
      )
      .orderBy(sortDirection === 'desc' ? desc(noteMetadata.updatedAt) : asc(noteMetadata.updatedAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Updates note metadata with optimistic locking.
   * Throws if the version does not match.
   */
  static async updateNoteMetadata(
    id: string,
    currentVersion: number,
    updates: Partial<{ title: string; excerpt: string; bodyKey: string }>
  ): Promise<NoteMetadata> {
    const existing = await this.getNoteMetadata(id);
    if (!existing) throw new Error('Note not found');

    const newTitle = updates.title ?? existing.title;
    const newExcerpt = updates.excerpt ?? existing.excerpt;

    return commitRevision(updates.bodyKey, existing.bucketPath, async (tx) => {
      const [record] = await tx
        .update(noteMetadata)
        .set({
          ...(() => {
            const base: Record<string, unknown> = {
              ...updates,
              version: currentVersion + 1,
              updatedAt: new Date(),
            };
            if (!(typeof env.databaseUrl === 'string' && env.databaseUrl.startsWith('pgmem://'))) {
              base.searchVector = buildSearchVector(newTitle, newExcerpt);
            }
            return base;
          })(),
        })
        .where(and(eq(noteMetadata.id, id), eq(noteMetadata.version, currentVersion)))
        .returning();

      if (!record) {
        throw new Error('Optimistic locking failed or note not found');
      }

      return record;
    });
  }

  /**
   * Deletes a note metadata record.
   */
  static async deleteNoteMetadata(id: string): Promise<void> {
    await db.delete(noteMetadata).where(eq(noteMetadata.id, id));
  }
}

export class NotesRepository {
  /**
   * Saves the markdown body of a note.
   */
  static async saveBody(bucketPath: string, content: string, bodyKey = 'body.md'): Promise<void> {
    await RustFS.saveFile(bucketPath, bodyKey, content);
  }

  /**
   * Retrieves the markdown body of a note.
   */
  static async getBody(bucketPath: string, bodyKey = 'body.md'): Promise<string> {
    return await RustFS.readFileUtf8(bucketPath, bodyKey);
  }

  /**
   * Saves an attached file to the note's bucket.
   */
  static async saveAttachment(bucketPath: string, filename: string, content: string | Buffer): Promise<void> {
    if (isNoteBodyFile(filename)) {
      throw new Error('Filename is reserved for note bodies');
    }
    await RustFS.saveFile(bucketPath, filename, content);
  }

  /**
   * Saves an attached stream to the note's bucket.
   */
  static async saveAttachmentStream(
    bucketPath: string,
    filename: string,
    stream: NodeJS.ReadableStream,
    contentLength?: number
  ): Promise<void> {
    if (isNoteBodyFile(filename)) {
      throw new Error('Filename is reserved for note bodies');
    }
    await RustFS.saveFileStream(bucketPath, filename, stream, contentLength);
  }

  /**
   * Retrieves an attached file from the note's bucket.
   */
  static async getAttachment(bucketPath: string, filename: string): Promise<Buffer> {
    return await RustFS.readFile(bucketPath, filename);
  }

  /**
   * Retrieves an attached file from the note's bucket as a stream.
   */
  static async getAttachmentStream(bucketPath: string, filename: string): Promise<NodeJS.ReadableStream> {
    return await RustFS.streamFile(bucketPath, filename);
  }

  /**
   * Deletes a specific file from the note's bucket.
   */
  static async deleteFile(bucketPath: string, filename: string): Promise<void> {
    await RustFS.deleteFile(bucketPath, filename);
  }

  /**
   * Deletes the entire note bucket.
   */
  static async deleteBucket(bucketPath: string): Promise<void> {
    await RustFS.deleteBucket(bucketPath);
  }
}

export function isNoteBodyFile(filename: string): boolean {
  return filename === 'body.md' || filename.startsWith('.revisions/');
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function commitRevision<T>(bodyKey: string | undefined, bucketPath: string, persist: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    if (bodyKey) {
      // Recovery uses a conditional UPDATE of this same row. Holding its lock
      // until the pointer commits makes publication and abandonment exclusive.
      const [revision] = await tx.select().from(noteBodyRevisions)
        .where(and(eq(noteBodyRevisions.bodyKey, bodyKey), eq(noteBodyRevisions.bucketPath, bucketPath)))
        .for('update');
      if (!revision || revision.state !== 'pending') throw new Error('REVISION_ABANDONED');
    }
    const result = await persist(tx);
    if (bodyKey) {
      await tx.update(noteBodyRevisions).set({ state: 'committed' })
        .where(eq(noteBodyRevisions.bodyKey, bodyKey));
    }
    return result;
  });
}

export class NoteRevisionRepository {
  static async stage(bucketPath: string, bodyKey: string): Promise<void> {
    await db.insert(noteBodyRevisions).values({ bucketPath, bodyKey });
  }

  static async abandon(bodyKey: string) {
    const [revision] = await db.update(noteBodyRevisions).set({ state: 'abandoned' })
      .where(and(eq(noteBodyRevisions.bodyKey, bodyKey), or(
        eq(noteBodyRevisions.state, 'pending'), eq(noteBodyRevisions.state, 'abandoned'),
      ))).returning();
    return revision;
  }

  static async recoveryCandidates(cutoff: Date) {
    return db.select().from(noteBodyRevisions).where(or(
      eq(noteBodyRevisions.state, 'abandoned'),
      and(eq(noteBodyRevisions.state, 'pending'), lt(noteBodyRevisions.createdAt, cutoff)),
    ));
  }
}
