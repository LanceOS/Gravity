let nextId = 1;

function send(obj: unknown) {
  const s = JSON.stringify(obj);
  const header = `Content-Length: ${Buffer.byteLength(s, 'utf8')}\r\n\r\n`;
  process.stdout.write(header + s);
}

// Minimal Content-Length framed stdio parser for the example agent. This
// prefers framed messages and only falls back to legacy single-line JSON as a
// best-effort. Legacy input must be single-line and reasonably small.
export function startExampleAgent() {
  const chunks: Buffer[] = [];
  let totalLength = 0;

  function appendChunk(b: Buffer) {
    if (!b || b.length === 0) return;
    chunks.push(b);
    totalLength += b.length;
  }

  function clearChunks() {
    chunks.length = 0;
    totalLength = 0;
  }

  function peekUpTo(n: number) {
    if (n <= 0) return Buffer.alloc(0);
    if (chunks.length === 0) return Buffer.alloc(0);
    if (chunks.length === 1 && chunks[0].length >= n) return chunks[0].slice(0, n);
    const out = Buffer.alloc(Math.min(n, totalLength));
    let off = 0;
    for (const c of chunks) {
      const take = Math.min(c.length, out.length - off);
      if (take <= 0) break;
      c.copy(out, off, 0, take);
      off += take;
      if (off >= out.length) break;
    }
    return out;
  }

  function readBytes(n: number) {
    if (n <= 0) return Buffer.alloc(0);
    if (n > totalLength) throw new Error('read past end');
    const out = Buffer.alloc(n);
    let off = 0;
    while (off < n) {
      const c = chunks[0];
      const take = Math.min(c.length, n - off);
      c.copy(out, off, 0, take);
      off += take;
      if (take === c.length) chunks.shift();
      else chunks[0] = c.slice(take);
    }
    totalLength -= n;
    return out;
  }

  function indexOfByte(byte: number) {
    let idx = 0;
    for (const c of chunks) {
      const pos = c.indexOf(byte);
      if (pos !== -1) return idx + pos;
      idx += c.length;
    }
    return -1;
  }

  function processBuffer() {
    const MAX_HEADER_SCAN = 64 * 1024;
    while (totalLength > 0) {
      const peekLen = Math.min(totalLength, MAX_HEADER_SCAN);
      const peek = peekUpTo(peekLen);

      let headerEnd = peek.indexOf('\r\n\r\n');
      let headerTermLen = 4;
      if (headerEnd === -1) {
        headerEnd = peek.indexOf('\n\n');
        if (headerEnd !== -1) headerTermLen = 2;
      }

      if (headerEnd !== -1) {
        const header = peek.slice(0, headerEnd).toString('ascii');
        const m = header.match(/Content-Length:\s*(\d+)/i);
        if (!m) {
          // consume header block and continue
          readBytes(headerEnd + headerTermLen);
          console.error('Missing Content-Length header from server');
          continue;
        }
        const length = parseInt(m[1], 10);
        if (!Number.isFinite(length) || length < 0) {
          readBytes(headerEnd + headerTermLen);
          console.error('Invalid Content-Length from server');
          continue;
        }
        const totalNeeded = headerEnd + headerTermLen + length;
        if (totalLength < totalNeeded) return; // wait for more
        // consume header
        readBytes(headerEnd + headerTermLen);
        const body = readBytes(length);
        try {
          const msg = JSON.parse(body.toString('utf8'));
          console.error('MCP Agent received:', JSON.stringify(msg));
        } catch (e) {
          console.error('Invalid JSON from server');
        }
        continue;
      }

      // fallback: single-line legacy JSON (best-effort). Keep small.
      const nlIndex = indexOfByte(0x0a);
      if (nlIndex !== -1) {
        const lineBuf = readBytes(nlIndex);
        // consume newline
        if (totalLength > 0) readBytes(1);
        const line = lineBuf.toString('utf8').trim();
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          console.error('MCP Agent received:', JSON.stringify(msg));
        } catch (e) {
          console.error('Invalid JSON from server:', line);
        }
        continue;
      }

      return;
    }
  }

  process.stdin.on('data', (chunk: Buffer | string) => {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    appendChunk(buf);
    try {
      processBuffer();
    } catch (e) {
      console.error('Example agent parser error');
      clearChunks();
    }
  });

  // Basic startup sequence: initialize then list tools.
  send({ jsonrpc: '2.0', id: nextId++, method: 'initialize', params: {} });
  setTimeout(() => send({ jsonrpc: '2.0', id: nextId++, method: 'tools/list', params: {} }), 150);
}

if (process.env.MCP_EXAMPLE_AGENT === '1') {
  startExampleAgent();
}
