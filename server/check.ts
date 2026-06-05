import { db } from './src/db/index.js';
import { authUsers } from './src/modules/auth/schema.js';
async function main() {
  const users = await db.select().from(authUsers);
  console.log(users);
  process.exit(0);
}
main().catch(console.error);
