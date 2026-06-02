import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { noteMetadata } from './schema.js';
import { RustFS } from '../../lib/rustfs.js';
import { env } from '../../env.js';

export type NoteMetadata = typeof noteMetadata.$inferSelect;

export type NoteListItem = Pick<NoteMetadata, 'id' | 'title' | 'excerpt' | 'version' | 'createdAt' | 'updatedAt'>;

function buildSearchVector(title: string, excerpt: string) {
  return sql`to_tsvector('english', ${title} || ' ' || ${excerpt})`;
}

export class MetadataRepository {
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
  }): Promise<NoteMetadata> {
    const excerpt = data.excerpt || '';
    const useSearchVector = typeof env.databaseUrl === 'string' && !env.databaseUrl.startsWith('pgmem://');

    const insertValues: Record<string, unknown> = {
      id: data.id,
      projectId: data.projectId,
      userId: data.userId,
      title: data.title,
      excerpt,
      bucketPath: data.bucketPath,
    };

    if (useSearchVector) {
      // Only include search vector when running against a real Postgres instance
      // because pg-mem does not support the tsvector type and related functions.
      insertValues.searchVector = buildSearchVector(data.title, excerpt);
    }

    const [record] = await db.insert(noteMetadata).values(insertValues).returning();

    return record;
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
    offset: number = 0
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
      .orderBy(desc(noteMetadata.updatedAt))
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
    offset: number = 0
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
      .orderBy(desc(noteMetadata.updatedAt))
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
    updates: Partial<{ title: string; excerpt: string }>
  ): Promise<NoteMetadata> {
    const existing = await this.getNoteMetadata(id);
    if (!existing) throw new Error('Note not found');

    const newTitle = updates.title ?? existing.title;
    const newExcerpt = updates.excerpt ?? existing.excerpt;

    const [record] = await db
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
  static async saveBody(bucketPath: string, content: string): Promise<void> {
    await RustFS.saveFile(bucketPath, 'body.md', content);
  }

  /**
   * Retrieves the markdown body of a note.
   */
  static async getBody(bucketPath: string): Promise<string> {
    return await RustFS.readFileUtf8(bucketPath, 'body.md');
  }

  /**
   * Saves an attached file to the note's bucket.
   */
  static async saveAttachment(bucketPath: string, filename: string, content: string | Buffer): Promise<void> {
    if (filename === 'body.md') {
      throw new Error('Filename cannot be body.md');
    }
    await RustFS.saveFile(bucketPath, filename, content);
  }

  /**
   * Retrieves an attached file from the note's bucket.
   */
  static async getAttachment(bucketPath: string, filename: string): Promise<Buffer> {
    return await RustFS.readFile(bucketPath, filename);
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
