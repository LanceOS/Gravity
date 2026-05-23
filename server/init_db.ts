import { initializeDatabase } from './src/db/bootstrap.js';

export async function main() {
  try {
    await initializeDatabase();
    console.log('Database initialized');
    process.exitCode = 0;
  } catch (err) {
    console.error('Failed to initialize database', err);
    process.exitCode = 1;
  }
}

const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  new URL(import.meta.url).pathname === process.argv[1];

if (isDirectExecution) {
  void main();
}
