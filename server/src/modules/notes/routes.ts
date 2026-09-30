import express, { Router } from 'express';
import { getProjectIdFromRequest } from '../../lib/platform.js';
import { authorizeProjectAccess } from '../workspaces/services/membership.js';
import { createNote, deleteNote, getNote, listNotes, updateNote, searchNotes, cleanupNoteMedia } from './services/notes.js';
import { isNoteBodyFile, MetadataRepository, NotesRepository } from './repositories.js';
import { deleteNoteMedia, MediaReferenceUnavailableError, NoteMediaInUseError } from './services/media-deletion.js';
import { resolveRequestActorUserId } from '../auth/utils/request-auth.js';

export function createNotesRouter() {
  const router = Router();

  function normalizeRouteParam(value: string | string[]) {
    return Array.isArray(value) ? value[0] ?? '' : value;
  }

  router.post('/notes', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId || !req.body?.title || !req.body?.body) {
      res.status(400).json({ error: 'Project ID, title, and body are required.' });
      return;
    }

    const auth = await authorizeProjectAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const created = await createNote(projectId, auth.userId, req.body.title, req.body.body);
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof MediaReferenceUnavailableError) {
        res.status(409).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create note.' });
    }
  });

  router.get('/notes/search', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required.' });
      return;
    }

    const auth = await authorizeProjectAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const query = typeof req.query.q === 'string' ? req.query.q : '';
    if (!query) {
      res.status(400).json({ error: 'Query parameter "q" is required.' });
      return;
    }

    try {
      const limit = Number(req.query.limit) || 50;
      const offset = Number(req.query.offset) || 0;
      const sort = (req.query.sort === 'asc' ? 'asc' : 'desc') as 'desc' | 'asc';
      const notesList = await searchNotes(projectId, auth.userId, query, limit, offset, sort);
      res.json(notesList);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to search notes.' });
    }
  });

  router.get('/notes', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required.' });
      return;
    }

    const auth = await authorizeProjectAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const limit = Number(req.query.limit) || 50;
      const offset = Number(req.query.offset) || 0;
      const sort = (req.query.sort === 'asc' ? 'asc' : 'desc') as 'desc' | 'asc';
      const notesList = await listNotes(projectId, auth.userId, limit, offset, sort);
      res.json(notesList);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load notes.' });
    }
  });

  router.get('/notes/:noteId', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required.' });
      return;
    }

    const auth = await authorizeProjectAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const noteId = normalizeRouteParam(req.params.noteId);
      const note = await getNote(noteId, projectId);
      
      if (!note) {
        res.status(404).json({ error: 'Note not found.' });
        return;
      }

      res.json(note);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load note.' });
    }
  });

  router.patch('/notes/:noteId', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required.' });
      return;
    }

    const auth = await authorizeProjectAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const noteId = normalizeRouteParam(req.params.noteId);
      const currentVersion = Number(req.body.version);
      
      if (isNaN(currentVersion)) {
        res.status(400).json({ error: 'Current version is required for optimistic locking.' });
        return;
      }

      const updated = await updateNote(noteId, projectId, currentVersion, {
        title: req.body.title,
        body: req.body.body,
      });

      res.json(updated);
    } catch (error: any) {
      if (error instanceof MediaReferenceUnavailableError) {
        res.status(409).json({ error: error.message });
      } else if (error.message === 'NOT_FOUND') {
        res.status(404).json({ error: 'Note not found.' });
      } else if (error.message === 'CONFLICT') {
        res.status(409).json({ error: 'Version conflict. Note has been modified by another process.' });
      } else {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update note.' });
      }
    }
  });

  router.delete('/notes/:noteId', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required.' });
      return;
    }

    const auth = await authorizeProjectAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const noteId = normalizeRouteParam(req.params.noteId);
      const deleted = await deleteNote(noteId, projectId);
      
      if (!deleted) {
        res.status(404).json({ error: 'Note not found.' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      if (error instanceof NoteMediaInUseError) {
        res.status(409).json({ error: error.message });
      } else {
        console.error('Note deletion failed');
        res.status(500).json({ error: 'Note deletion could not be confirmed; see server diagnostics.' });
      }
    }
  });

  const FILENAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
  const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.mp3', '.wav', '.ogg', '.pdf', '.txt', '.md'];

  router.post('/notes/:noteId/media', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required.' });
      return;
    }

    const auth = await authorizeProjectAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const noteId = normalizeRouteParam(req.params.noteId);
      const filename = req.query.filename ? String(req.query.filename) : `upload-${Date.now()}`;

      if (!FILENAME_REGEX.test(filename)) {
        res.status(400).json({ error: 'Invalid filename format.' });
        return;
      }

      const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        res.status(400).json({ error: 'File extension is not allowed.' });
        return;
      }

      const contentLengthHeader = req.headers['content-length'];
      if (!contentLengthHeader) {
        res.status(411).json({ error: 'Content-Length header is required.' });
        return;
      }
      const contentLength = parseInt(contentLengthHeader, 10);
      if (isNaN(contentLength) || contentLength < 0) {
        res.status(400).json({ error: 'Invalid Content-Length.' });
        return;
      }
      if (contentLength > 10 * 1024 * 1024) {
        res.status(413).json({ error: 'Payload Too Large. Max limit is 10MB.' });
        return;
      }
      
      const noteMeta = await MetadataRepository.getNoteMetadata(noteId);
      if (!noteMeta || noteMeta.projectId !== projectId) {
        res.status(404).json({ error: 'Note not found.' });
        return;
      }
      
      try {
        await NotesRepository.saveAttachmentStream(noteMeta.bucketPath, filename, req, contentLength);
      } catch (uploadErr: any) {
        if (uploadErr.message === 'LIMIT_EXCEEDED') {
          res.status(413).json({ error: 'Payload Too Large. Stream exceeded maximum allowed limit.' });
          return;
        }
        throw uploadErr;
      }
      
      res.status(201).json({ url: `/api/v1/notes/${encodeURIComponent(noteId)}/media/${encodeURIComponent(filename)}?projectId=${encodeURIComponent(projectId)}` });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to upload media.' });
    }
  });

  router.get('/notes/:noteId/media/:filename', async (req, res) => {
    // Do not cache either media or authorization failures across sessions.
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      const noteId = normalizeRouteParam(req.params.noteId);
      const filename = normalizeRouteParam(req.params.filename);
      let projectId = getProjectIdFromRequest(req);
      let noteMeta = null;

      if (!projectId) {
        // Legacy note bodies contain bare media URLs. Authenticate before
        // resolving their scope, then apply the same project membership check.
        if (!await resolveRequestActorUserId(req)) {
          res.status(401).json({ error: 'Authentication required.' });
          return;
        }
        noteMeta = await MetadataRepository.getNoteMetadata(noteId);
        if (!noteMeta) {
          res.status(404).json({ error: 'Note not found.' });
          return;
        }
        projectId = noteMeta.projectId;
      }

      const auth = await authorizeProjectAccess(req, projectId);
      if (!auth.allowed) {
        res.status(auth.status).json({ error: auth.error });
        return;
      }
      if (!FILENAME_REGEX.test(filename)) {
        res.status(400).json({ error: 'Invalid filename format.' });
        return;
      }

      noteMeta ??= await MetadataRepository.getNoteMetadata(noteId);
      if (!noteMeta || noteMeta.projectId !== projectId) {
        res.status(404).json({ error: 'Note not found.' });
        return;
      }

      const stream = await NotesRepository.getAttachmentStream(noteMeta.bucketPath, filename);
      
      const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
      let contentType = 'application/octet-stream';
      let isInline = false;
      if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
        contentType = `image/${ext.slice(1)}`;
        if (ext === '.jpg') contentType = 'image/jpeg';
        isInline = true;
      } else if (['.mp4', '.webm'].includes(ext)) {
        contentType = `video/${ext.slice(1)}`;
        isInline = true;
      } else if (['.mp3', '.wav', '.ogg'].includes(ext)) {
        contentType = `audio/${ext.slice(1)}`;
        if (ext === '.mp3') contentType = 'audio/mpeg';
        isInline = true;
      } else if (ext === '.pdf') {
        contentType = 'application/pdf';
      } else if (ext === '.txt') {
        contentType = 'text/plain';
      } else if (ext === '.md') {
        contentType = 'text/markdown';
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

      if (isInline) {
        res.setHeader('Content-Disposition', 'inline');
      } else {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      }

      stream.on('error', (err: any) => {
        if (err.code === 'ENOENT') {
          if (!res.headersSent) {
            res.status(404).json({ error: 'Media not found.' });
          }
        } else {
          if (!res.headersSent) {
            res.status(500).json({ error: err.message || 'Stream error.' });
          }
        }
      });

      // @ts-ignore
      stream.pipe(res);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        res.status(404).json({ error: 'Media not found.' });
      } else {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load media.' });
      }
    }
  });

  router.delete('/notes/:noteId/media/:filename', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required.' });
      return;
    }

    const auth = await authorizeProjectAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const noteId = normalizeRouteParam(req.params.noteId);
      const filename = normalizeRouteParam(req.params.filename);

      if (!FILENAME_REGEX.test(filename)) {
        res.status(400).json({ error: 'Invalid filename format.' });
        return;
      }

      if (isNoteBodyFile(filename)) {
        res.status(400).json({ error: 'Filename is reserved for note bodies' });
        return;
      }
      const result = await deleteNoteMedia(noteId, projectId, filename);
      if (!result) {
        res.status(404).json({ error: 'Note not found.' });
        return;
      }
      res.json(result);
    } catch (error) {
      console.error('Media deletion failed');
      res.status(500).json({ error: 'Media deletion could not be confirmed; see server diagnostics.' });
    }
  });

  router.post('/notes/:noteId/cleanup', async (req, res) => {
    const projectId = getProjectIdFromRequest(req);
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required.' });
      return;
    }

    const auth = await authorizeProjectAccess(req, projectId);
    if (!auth.allowed) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    try {
      const noteId = normalizeRouteParam(req.params.noteId);
      const result = await cleanupNoteMedia(noteId, projectId, { dryRun: req.query.dryRun === 'true' });
      res.json(result);
    } catch (error: any) {
      if (error.message === 'NOT_FOUND') {
        res.status(404).json({ error: 'Note not found.' });
      } else {
        // The global scan can fail on a note outside the caller's project.
        // Keep its identifiers and storage path in server diagnostics only.
        console.error('Note media cleanup blocked', error);
        res.status(500).json({ error: 'Media cleanup blocked; see server diagnostics.' });
      }
    }
  });

  return router;
}
