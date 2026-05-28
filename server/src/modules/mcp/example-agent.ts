import * as readline from 'node:readline';

let nextId = 1;

function send(obj: unknown) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

export function startExampleAgent() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  rl.on('line', (line: string) => {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);
      console.error('MCP Agent received:', JSON.stringify(msg));
    } catch (e) {
      console.error('Invalid JSON from server:', line);
    }
  });

  // Basic startup sequence: initialize then list tools.
  send({ jsonrpc: '2.0', id: nextId++, method: 'initialize', params: {} });
  setTimeout(() => send({ jsonrpc: '2.0', id: nextId++, method: 'tools/list', params: {} }), 150);
}

if (process.env.MCP_EXAMPLE_AGENT === '1') {
  startExampleAgent();
}
