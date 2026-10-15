import { describe, expect, it, vi } from 'vitest';
import { DefaultNotesService } from '../../modules/notes/services/notesService';

const base = {
  id: 'note-legacy', title: 'Legacy', version: 1,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

describe('note transport compatibility', () => {
  it('keeps legacy author-only notes visible as private during a rolling update', async () => {
    const client = { get: vi.fn(async (path: string) => path === '/notes'
      ? [base]
      : { ...base, projectId: 'project', userId: 'author', body: 'body' }) };
    const service = new DefaultNotesService(client as unknown as ConstructorParameters<typeof DefaultNotesService>[0]);
    expect(await service.listNotes('project', { limit: 50, offset: 0, sort: 'desc' }))
      .toEqual([{ ...base, projectId: 'project', userId: '', visibility: 'private' }]);
    expect(await service.getNote('project', base.id))
      .toEqual({ ...base, projectId: 'project', userId: 'author', visibility: 'private', body: 'body' });
  });

  it('rejects an unknown visibility value instead of treating it as shared', async () => {
    const client = { get: vi.fn(async () => ({ ...base, projectId: 'project', userId: 'author', body: 'body', visibility: 'unknown' })) };
    const service = new DefaultNotesService(client as unknown as ConstructorParameters<typeof DefaultNotesService>[0]);
    await expect(service.getNote('project', base.id)).rejects.toThrow('Invalid note payload');
  });
});
