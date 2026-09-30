import { z } from 'zod';
import type { RequestHandler } from 'express';

// Limits apply to both legacy Markdown and serialized editor documents.
export const NOTE_BODY_MAX_BYTES = 512 * 1024;
export const NOTE_CONTENT_MAX_DEPTH = 32;
export const NOTE_CONTENT_MAX_NODES = 10000;
const identifier = z.string().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/);
const title = z.string().min(1).max(500).refine(value => value.trim().length > 0 && !value.includes('\0'));
const body = z.string().refine(value => {
  if (value.includes('\0') || Buffer.byteLength(value, 'utf8') > NOTE_BODY_MAX_BYTES) return false;
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return true; } // Legacy Markdown.
  const pending = [{ value: parsed, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (typeof entry.value === 'string' && entry.value.includes('\0')) return false;
    if (++nodes > NOTE_CONTENT_MAX_NODES || entry.depth > NOTE_CONTENT_MAX_DEPTH) return false;
    if (entry.value && typeof entry.value === 'object') {
      for (const child of Object.values(entry.value)) pending.push({ value: child, depth: entry.depth + 1 });
    }
  }
  return true;
}, 'Note body exceeds content limits.');
const paging = (fallback: number, minimum: number, maximum: number) => z.string()
  .regex(/^\d{1,7}$/).transform(Number).pipe(z.number().int().min(minimum).max(maximum)).optional()
  .transform(value => value ?? fallback);
export const noteQuery = z.object({
  limit: paging(50, 1, 100), offset: paging(0, 0, 100000),
  sort: z.enum(['asc', 'desc']).default('desc'),
});
const create = z.object({ title, body, projectId: identifier.optional() }).strict();
const update = z.object({ title: title.optional(), body: body.optional(),
  version: z.number().int().min(1).max(2147483646), projectId: identifier.optional(),
}).strict().refine(value => value.title !== undefined || value.body !== undefined);
const filename = z.string().min(1).max(255).regex(/^[a-zA-Z0-9_.-]+$/)
  .refine(value => value !== '.' && value !== '..');

export const validateNoteRequest: RequestHandler = (req, res, next) => {
  const route = req.route.path;
  const check = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;
  // Express's simple query parser treats bracket syntax as an unrelated key and
  // tolerates malformed percent escapes. Neither should silently select defaults.
  try {
    const queryStart = req.originalUrl.indexOf('?');
    const query = queryStart < 0 ? '' : req.originalUrl.slice(queryStart + 1);
    for (const component of query.split('&')) {
      const separator = component.indexOf('=');
      const key = decodeURIComponent((separator < 0 ? component : component.slice(0, separator)).replace(/\+/g, ' '));
      decodeURIComponent((separator < 0 ? '' : component.slice(separator + 1)).replace(/\+/g, ' '));
      if (/^(?:limit|offset|sort|q|projectId|filename|dryRun)\[/.test(key)) throw new URIError();
    }
  } catch {
    res.status(400).json({ error: 'Invalid note request.' });
    return;
  }
  const scopeValues = [req.headers['x-project-id'], req.query.projectId, req.body?.projectId];
  let valid = scopeValues.every(value => value === undefined || check(identifier, value));
  if (req.params.noteId !== undefined) valid &&= check(identifier, req.params.noteId);
  if (req.params.filename !== undefined) valid &&= check(filename, req.params.filename);
  if ((req.method === 'GET' || req.method === 'HEAD') && !req.params.noteId) {
    valid &&= check(noteQuery, req.query);
    if (route === '/notes/search') valid &&= check(z.string().min(1).max(1000).refine(value => value.trim().length > 0 && !value.includes('\0')), req.query.q);
  }
  if (req.method === 'POST' && route === '/notes') valid &&= check(create, req.body);
  if (req.method === 'PATCH') valid &&= check(update, req.body);
  if ((req.method === 'POST' || req.method === 'DELETE') && route.includes('/media')) {
    // Reserved storage objects are never attachment mutation targets.
    valid &&= (req.params.filename ?? req.query.filename) !== 'body.md';
  }
  if (req.method === 'POST' && route.endsWith('/media')) {
    valid &&= check(filename, req.query.filename);
    valid &&= req.headers['content-encoding'] === undefined || req.headers['content-encoding'] === 'identity';
    valid &&= check(z.string().regex(/^\d{1,8}$/).transform(Number).pipe(z.number().int().min(0).max(10 * 1024 * 1024)), req.headers['content-length']);
  }
  if (route.endsWith('/cleanup')) valid &&= check(z.enum(['true', 'false']).optional(), req.query.dryRun);
  if (!valid) { res.status(400).json({ error: 'Invalid note request.' }); return; }
  next();
};
