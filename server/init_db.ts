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
