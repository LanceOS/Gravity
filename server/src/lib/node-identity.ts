import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { identities } from '../db/schema.js';
import { env } from '../env.js';
import { encryptNodePrivateKey } from './crypto.js';

type IdentityRecord = typeof identities.$inferSelect;

function createIdentityId() {
  return `idn-${randomUUID()}`;
}

function generateNodeKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export async function getLocalNodeIdentity() {
  const rows = await db.select().from(identities).where(eq(identities.isLocalOwner, true)).limit(1);
  return rows[0] ?? null;
}

export async function ensureLocalNodeIdentity(): Promise<IdentityRecord> {
  const existingIdentity = await getLocalNodeIdentity();
  if (existingIdentity?.publicKey && existingIdentity.encryptedPrivateKey) {
    return existingIdentity;
  }

  const keyPair = generateNodeKeyPair();
  const displayName = existingIdentity?.displayName?.trim() || env.nodeDisplayName;
  const encryptedPrivateKey = encryptNodePrivateKey(keyPair.privateKey);

  if (!encryptedPrivateKey) {
    throw new Error('Failed to encrypt the local node private key.');
  }

  if (existingIdentity) {
    const rows = await db
      .update(identities)
      .set({
        displayName,
        publicKey: keyPair.publicKey,
        encryptedPrivateKey,
        isLocalOwner: true,
      })
      .where(eq(identities.id, existingIdentity.id))
      .returning();

    return rows[0] ?? existingIdentity;
  }

  const rows = await db
    .insert(identities)
    .values({
      id: createIdentityId(),
      displayName,
      publicKey: keyPair.publicKey,
      encryptedPrivateKey,
      isLocalOwner: true,
      createdAt: new Date(),
    })
    .returning();

  return rows[0];
}