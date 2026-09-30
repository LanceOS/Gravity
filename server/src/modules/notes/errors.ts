import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler, Response } from 'express';

const ERROR_CODES: Record<number, string> = {
  400: 'INVALID_INPUT', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN',
  404: 'NOT_FOUND', 409: 'CONFLICT', 411: 'INVALID_INPUT', 413: 'INVALID_INPUT',
  429: 'RATE_LIMITED', 503: 'UNAVAILABLE',
};

export const noteErrorContext: RequestHandler = (_req, res, next) => {
  if (!res.locals.noteRequestId) {
    res.locals.noteRequestId = randomUUID();
    res.setHeader('X-Request-ID', res.locals.noteRequestId);
    res.setHeader('Cache-Control', 'private, no-store');
    const json = res.json.bind(res);
    res.json = value => {
      if (res.statusCode >= 400) {
        res.type('application/json');
        res.removeHeader('Content-Disposition');
        return json({ error: value.error, code: ERROR_CODES[res.statusCode] ?? 'INTERNAL_ERROR', requestId: res.locals.noteRequestId });
      }
      return json(value);
    };
  }
  next();
};

export function logNoteFailure(res: Response, error: unknown, operation: string) {
  // Arbitrary exception messages, SQL, paths, request bodies and headers may
  // contain secrets. Log only allowlisted diagnostic metadata and code locations.
  const err = error as { code?: unknown; stack?: unknown } | null;
  const knownCodes = ['ENOENT', 'EIO', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT',
    '23505', '23503', '40001', '40P01', '53300', '57P01', '08006'];
  const code = typeof err?.code === 'string' && knownCodes.includes(err.code) ? err.code : 'UNKNOWN';
  const frames = typeof err?.stack === 'string'
    ? [...err.stack.matchAll(/^\s+at [^\n]*?\/server\/src\/((?:modules\/notes\/(?:routes|repositories|services\/notes|services\/media-cleanup)|lib\/rustfs)\.[jt]s):(\d+):(\d+)\)?$/gm)]
      .slice(0, 6).map(match => `${match[1]}:${match[2]}:${match[3]}`)
    : [];
  console.error('Note API failure', { requestId: res.locals.noteRequestId, operation, code, frames });
}

export const noteErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (!res.locals.noteRequestId) { next(error); return; }
  if (res.headersSent) { res.destroy(); return; }
  if (error instanceof URIError || ['entity.parse.failed', 'entity.too.large', 'encoding.unsupported', 'charset.unsupported', 'request.size.invalid'].includes(error?.type)) {
    res.status(400).json({ error: 'Invalid note request.' });
    return;
  }
  logNoteFailure(res, error, 'request');
  res.status(500).json({ error: 'Unable to complete note request.' });
};
