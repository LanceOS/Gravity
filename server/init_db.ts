import { initializeDatabase } from './src/db/bootstrap.ts';

async function main() {
  try {
    await initializeDatabase();
    console.log('Database initialized');
    process.exit(0);
  } catch (err) {
    console.error('Failed to initialize database', err);
    process.exit(1);
  }
}

main();
