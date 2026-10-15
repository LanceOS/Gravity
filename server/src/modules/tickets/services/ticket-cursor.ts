export type TicketCursorPosition = { createdAt: string; id: string };

export function encodeTicketCursor(position: TicketCursorPosition, fingerprint: string): string {
  return Buffer.from(JSON.stringify({ version: 1, fingerprint, ...position })).toString('base64url');
}

export function decodeTicketCursor(value: unknown, fingerprint: string): TicketCursorPosition | null {
  try {
    if (typeof value !== 'string' || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object' ||
      !('version' in decoded) || decoded.version !== 1 ||
      !('fingerprint' in decoded) || decoded.fingerprint !== fingerprint ||
      !('createdAt' in decoded) || typeof decoded.createdAt !== 'string' ||
      decoded.createdAt.length > 64 || !Number.isFinite(Date.parse(decoded.createdAt)) ||
      !('id' in decoded) || typeof decoded.id !== 'string' || !decoded.id || decoded.id.length > 200) return null;
    return { createdAt: decoded.createdAt, id: decoded.id };
  } catch {
    return null;
  }
}
