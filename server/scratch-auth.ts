import { auth } from './src/modules/auth/auth.js';
import { db } from './src/db/index.js';
import { authAccounts } from './src/modules/auth/schema.js';

async function test() {
  process.env.DATABASE_URL = 'pgmem://';
  const result = await auth.api.signUpEmail({
    body: {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User'
    }
  });
  
  const accounts = await db.select().from(authAccounts);
  console.log('ACCOUNT ROWS:', accounts);
}
test().catch(console.error);
