import { hashPassword } from "better-auth/crypto";
async function main() {
  const hash = await hashPassword("password123");
  console.log("HASH_RESULT:", hash);
}
main();
