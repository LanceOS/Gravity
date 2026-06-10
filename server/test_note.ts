import { createNote } from './src/modules/notes/services/notes.js';

async function test() {
  try {
    const result = await createNote('proj-123', 'user-123', 'Test Title', 'Test Body');
    console.log('Success:', result);
  } catch (err: any) {
    console.error('Failed:');
    console.dir(err, { depth: null });
  }
}

test();
