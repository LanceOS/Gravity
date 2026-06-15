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

function isNoteMetadata(value: unknown): value is NoteMetadata {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<NoteMetadata>;
  return isString(candidate.id)
    && isString(candidate.projectId)
    && isString(candidate.userId)
    && isString(candidate.title)
    && isNumber(candidate.version)
    && isString(candidate.createdAt)
    && isString(candidate.updatedAt);
}

function isNote(value: unknown): value is Note {
  return isNoteMetadata(value) && isString((value as Partial<Note>).body);
}

function ensureNote(value: unknown): Note {
  if (isNote(value)) {
    return value;
  }

  throw new ApiError(500, 'Invalid note payload.');
}

function normalizeNoteMetadataList(data: unknown): NoteMetadata[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.filter(isNoteMetadata);
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
  constructor(private readonly client = apiClient) {}

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

    return normalizeNoteMetadataList(data);
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
