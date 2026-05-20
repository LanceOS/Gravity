import readline from 'readline';
import { handleMcpRequest } from './mcp.js';
import { initCentralDB } from './db.js';

// Initialize the database schema on startup.
initCentralDB();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

console.error('Gravity MCP Stdio Server running...');

rl.on('line', async (line) => {
  if (!line.trim()) return;

  try {
    const request = JSON.parse(line);
    const response = await handleMcpRequest(request);
    console.log(JSON.stringify(response));
  } catch (error: any) {
    console.error(`Error parsing or handling line: ${error.message}`);
    // Output standard JSON-RPC parse error if JSON parse fails
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error'
      }
    }));
  }
});
