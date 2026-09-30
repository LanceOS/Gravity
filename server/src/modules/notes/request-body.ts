import express, { type RequestHandler } from 'express';

const jsonParser = express.json({ limit: '1mb' });

/** Attachments are raw bytes, even when their declared type is JSON. */
export const parseApiJson: RequestHandler = (req, res, next) => {
  if (req.method === 'POST' && /^\/api\/v1\/notes\/[^/]+\/media\/?$/i.test(req.path)) {
    next();
    return;
  }
  jsonParser(req, res, next);
};
