import { ApiError, apiClient } from '../../../utils/apiClient';
import type { Note, NoteMetadata } from '../types';

export interface NotesService {
  getNote(projectId: string, noteId: string): Promise<Note>;
  listNotes(projectId: string, options: NotesListOptions): Promise<NoteMetadata[]>;
  updateNote(projectId: string, noteId: string, updates: NoteUpdatePayload): Promise<Note>;
  uploadMedia(projectId: string, noteId: string, file: File): Promise<NoteAttachment>;
}

export interface NotesListOptions {
  limit: number;
  offset: number;
  sort: 'desc' | 'asc';
}

export interface NoteUpdatePayload {
  title?: string;
  body?: string;
  visibility?: 'private' | 'shared';
  version: number;
}

export interface NoteAttachment {
  url: string;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

function normalizeNoteMetadata(value: unknown, projectId?: string): NoteMetadata | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<NoteMetadata>;
  if (!isString(candidate.id) || !isString(candidate.projectId ?? projectId)
    || !isString(candidate.title) || !isNumber(candidate.version)
    || !isString(candidate.createdAt) || !isString(candidate.updatedAt)
    || (candidate.visibility !== undefined && candidate.visibility !== 'private' && candidate.visibility !== 'shared')) return null;
  // Legacy servers returned author-only lists without these fields. A missing
  // visibility is private; the detail response supplies the actual author.
  return {
    ...candidate,
    id: candidate.id,
    projectId: candidate.projectId ?? projectId!,
    userId: isString(candidate.userId) ? candidate.userId : '',
    visibility: candidate.visibility ?? 'private',
    title: candidate.title,
    version: candidate.version,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}

function ensureNote(value: unknown): Note {
  const metadata = normalizeNoteMetadata(value);
  if (metadata && metadata.userId && isString((value as Partial<Note>).body)) {
    const canManage = (value as Partial<Note>).canManage;
    return { ...metadata, body: (value as Note).body, ...(typeof canManage === 'boolean' ? { canManage } : {}) };
  }

  throw new ApiError(500, 'Invalid note payload.');
}

function normalizeNoteMetadataList(data: unknown, projectId: string): NoteMetadata[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map(value => normalizeNoteMetadata(value, projectId)).filter((value): value is NoteMetadata => value !== null);
}

function validateAttachment(data: unknown): NoteAttachment {
  if (
    !data
    || typeof data !== 'object'
    || !('url' in data)
    || !isString((data as { url?: unknown }).url)
  ) {
    throw new ApiError(500, 'Invalid upload response.');
  }

  return { url: (data as { url: string }).url };
}

export class DefaultNotesService implements NotesService {
  private readonly client: typeof apiClient;

  constructor(client = apiClient) {
    this.client = client;
  }

  async getNote(projectId: string, noteId: string): Promise<Note> {
    const note = await this.client.get<unknown>(`/notes/${noteId}`, { projectId });
    return ensureNote(note);
  }

  async listNotes(projectId: string, options: NotesListOptions): Promise<NoteMetadata[]> {
    const data = await this.client.get<unknown>('/notes', {
      projectId,
      params: {
        limit: `${options.limit}`,
        offset: `${options.offset}`,
        sort: options.sort,
      },
    });

    return normalizeNoteMetadataList(data, projectId);
  }

  async updateNote(projectId: string, noteId: string, updates: NoteUpdatePayload): Promise<Note> {
    const note = await this.client.patch<unknown>(`/notes/${noteId}`, updates, { projectId });
    return ensureNote(note);
  }

  async uploadMedia(projectId: string, noteId: string, file: File): Promise<NoteAttachment> {
    const data = await this.client.postBinary<unknown>(`/notes/${noteId}/media?filename=${encodeURIComponent(file.name)}`, file, {
      projectId,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
    });

    return validateAttachment(data);
  }
}

export const notesService = new DefaultNotesService();
