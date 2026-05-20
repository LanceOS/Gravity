import type { Request, Response } from 'express';

const clients = new Set<Response>();

export function subscribeToEvents(req: Request, res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.write('data: {"type":"init","message":"Connected to Gravity live stream"}\n\n');
  clients.add(res);

  req.on('close', () => {
    clients.delete(res);
  });
}

export function broadcastEvent(type: string, data: unknown) {
  const payload = JSON.stringify({ type, data });
  for (const client of clients) {
    client.write(`data: ${payload}\n\n`);
  }
}