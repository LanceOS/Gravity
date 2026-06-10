import express from 'express';
import { createApiRouter } from './server/dist/routes/index.js';

const app = express();
app.use('/api/v1', createApiRouter());

const req = { method: 'GET', url: '/api/v1/labels', headers: {} };
const res = {
  status: (code) => { console.log('STATUS:', code); return res; },
  setHeader: (k, v) => {},
  json: (data) => console.log('JSON:', data)
};

app.handle(req, res, () => console.log('FALLTHROUGH 404'));
