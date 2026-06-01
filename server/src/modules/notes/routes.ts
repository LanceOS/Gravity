import express, { Router } from 'express';
import { getProjectIdFromRequest } from '../../lib/platform.js';
import { authorizeProjectAccess } from '../workspaces/services/membership.js';
import { createNote, deleteNote, getNote, listNotes, updateNote } from './services/notes.js';
import { MetadataRepository, NotesRepository } from './repositories.js';

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
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create note.' });
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
      const notesList = await listNotes(projectId, auth.userId, limit, offset);
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
      if (error.message === 'NOT_FOUND') {
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
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete note.' });
    }
  });

  router.post('/notes/:noteId/media', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
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
      
      const noteMeta = await MetadataRepository.getNoteMetadata(noteId);
      if (!noteMeta || noteMeta.projectId !== projectId) {
        res.status(404).json({ error: 'Note not found.' });
        return;
      }
      
      await NotesRepository.saveAttachment(noteMeta.bucketPath, filename, req.body);
      
      res.status(201).json({ url: `/api/v1/notes/${noteId}/media/${encodeURIComponent(filename)}` });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to upload media.' });
    }
  });

  router.get('/notes/:noteId/media/:filename', async (req, res) => {
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
      
      const noteMeta = await MetadataRepository.getNoteMetadata(noteId);
      if (!noteMeta || noteMeta.projectId !== projectId) {
        res.status(404).json({ error: 'Note not found.' });
        return;
      }

      const fileBuffer = await NotesRepository.getAttachment(noteMeta.bucketPath, filename);
      
      // Determine content type heuristically or just let browser handle
      res.type(filename.split('.').pop() || 'application/octet-stream');
      res.send(fileBuffer);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        res.status(404).json({ error: 'Media not found.' });
      } else {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load media.' });
      }
    }
  });

  return router;
}
