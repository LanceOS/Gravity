import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { db } from '../../../db/index.js';
import * as schema from '../../../db/schema.js';
import { userExternalCredentials } from '../../../db/schema.js';
import { CredentialsUnavailableError } from './availability.js';
import type { IKMSProvider } from './types.js';

type DbClient = NodePgDatabase<typeof schema> | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * @description Manages the secure storage and retrieval of external credentials (e.g., API keys).
 * Uses envelope encryption to protect credentials at rest. Relies on an injected KMS provider
 * to handle Data Encryption Keys (DEKs). Wipes mutable secret buffers; immutable JavaScript
 * strings cannot be reliably zeroized.
 */
export class CredentialManager {
  constructor(private readonly kmsProvider: IKMSProvider, readonly available = true) {}

  assertAvailable(): void {
    if (!this.available) throw new CredentialsUnavailableError();
  }

  /**
   * @description Helper to safely fill/zero out Buffers to avoid retaining secrets in memory.
   * Overwrites the buffer contents with zeros.
   * @param {Buffer | undefined | null} buf - The buffer to securely wipe.
   */
  private secureWipeBuffer(buf: Buffer | undefined | null): void {
    if (buf) {
      buf.fill(0);
    }
  }

  /**
   * @description Flow A: Encrypts and securely stores the user's external API key in the database
   * using envelope encryption (AES-256-GCM).
   * @param {string} userId - The unique identifier of the user.
   * @param {string} plaintextAPIKey - The raw API key to be encrypted and stored.
   * @return {Promise<void>} Resolves when the credential has been safely stored.
   * @throws {Error} If required parameters are missing.
   */
  async StoreCredential(
    userId: string,
    provider: string,
    plaintextAPIKey: string,
    preferredModel?: string,
    dbClient: DbClient = db,
  ): Promise<void> {
    if (!userId) {
      throw new Error('User ID is required to store credentials.');
    }
    if (!provider) {
      throw new Error('Provider is required to store credentials.');
    }
    if (!plaintextAPIKey) {
      throw new Error('API Key cannot be empty.');
    }

    this.assertAvailable();
    const normalizedProvider = provider.toLowerCase();

    // 1. Generate DEK from KMS provider
    const { plaintextDEK, encryptedDEK, kekId } = this.kmsProvider.GenerateDataKey();

    // 2. Generate a random 12-byte IV using CSPRNG
    const iv = randomBytes(12);

    let plaintextKeyBuffer: Buffer | null = null;
    let ciphertext: Buffer | null = null;
    let authTag: Buffer | null = null;

    try {
      plaintextKeyBuffer = Buffer.from(plaintextAPIKey, 'utf8');

      // 3. Encrypt the API key using AES-256-GCM and the plaintext DEK
      const cipher = createCipheriv('aes-256-gcm', plaintextDEK, iv);
      ciphertext = Buffer.concat([
        cipher.update(plaintextKeyBuffer),
        cipher.final()
      ]);
      authTag = cipher.getAuthTag();

      // 5. Save/Upsert the credential record to the database using the injected dbClient
      const valuesToInsert: any = {
        userId,
        provider: normalizedProvider,
        encryptedApiKey: ciphertext,
        encryptedDek: encryptedDEK,
        aesIv: iv,
        aesAuthTag: authTag,
        kmsKekId: kekId,
        updatedAt: new Date(),
      };
      
      const valuesToSet: any = {
        encryptedApiKey: ciphertext,
        encryptedDek: encryptedDEK,
        aesIv: iv,
        aesAuthTag: authTag,
        kmsKekId: kekId,
        updatedAt: new Date(),
      };

      if (preferredModel !== undefined) {
        valuesToInsert.preferredModel = preferredModel;
        valuesToSet.preferredModel = preferredModel;
      }

      await dbClient
        .insert(userExternalCredentials)
        .values(valuesToInsert)
        .onConflictDoUpdate({
          target: [userExternalCredentials.userId, userExternalCredentials.provider],
          set: valuesToSet,
        });
    } finally {
      // 4. Immediately zeroize/overwrite plaintext keys in memory
      this.secureWipeBuffer(plaintextDEK);
      if (plaintextKeyBuffer) {
        this.secureWipeBuffer(plaintextKeyBuffer);
      }
    }
  }

  /**
   * @description Flow B: Retrieves and decrypts the user's API key, executes the provided callback with it,
   * and wipes the mutable secret buffers when done. The immutable JavaScript string passed to the callback
   * cannot be reliably zeroized.
   * @param {string} userId - The unique identifier of the user.
   * @param {(decryptedAPIKey: string) => Promise<T> | T} executionCallback - The function to execute with the decrypted key.
   * @return {Promise<T>} The result of the execution callback.
   * @throws {Error} If credentials are not found, or if decryption/integrity check fails.
   */
  async ExecuteWithCredential<T>(
    userId: string,
    provider: string,
    executionCallback: (decryptedAPIKey: string) => Promise<T> | T
  ): Promise<T> {
    if (!userId) {
      throw new Error('User ID is required to execute with credentials.');
    }
    if (!provider) {
      throw new Error('Provider is required to execute with credentials.');
    }

    this.assertAvailable();
    const normalizedProvider = provider.toLowerCase();

    // 1. Fetch user's record from database
    const [record] = await db
      .select()
      .from(userExternalCredentials)
      .where(and(eq(userExternalCredentials.userId, userId), eq(userExternalCredentials.provider, normalizedProvider)))
      .limit(1);

    if (!record) {
      throw new Error(`Security Exception: No external credentials found for user ${userId} and provider ${normalizedProvider}`);
    }

    let plaintextDEK: Buffer | null = null;
    let decryptedKeyUpdateBuffer: Buffer | null = null;
    let decryptedKeyFinalBuffer: Buffer | null = null;
    let decryptedKeyBuffer: Buffer | null = null;

    try {
      let decryptedAPIKeyString: string;

      // Keep the crypto catch separate from the callback so callback failures retain their
      // original classification. The update chunk may contain unauthenticated plaintext until
      // final() verifies the GCM tag, so every chunk must remain reachable by the outer cleanup.
      try {
        // 2. Call DecryptDataKey to unwrap the DEK
        plaintextDEK = this.kmsProvider.DecryptDataKey(record.encryptedDek);

        // 3. Decrypt the API key using AES-256-GCM and verify integrity
        const decipher = createDecipheriv('aes-256-gcm', plaintextDEK, record.aesIv);
        decipher.setAuthTag(record.aesAuthTag);

        decryptedKeyUpdateBuffer = decipher.update(record.encryptedApiKey);
        decryptedKeyFinalBuffer = decipher.final();
        decryptedKeyBuffer = Buffer.concat([decryptedKeyUpdateBuffer, decryptedKeyFinalBuffer]);

        // The concatenated buffer is needed to decode the key, but the source chunks are not.
        this.secureWipeBuffer(decryptedKeyUpdateBuffer);
        decryptedKeyUpdateBuffer = null;
        this.secureWipeBuffer(decryptedKeyFinalBuffer);
        decryptedKeyFinalBuffer = null;

        decryptedAPIKeyString = decryptedKeyBuffer.toString('utf8');
      } catch {
        throw new Error(
          'Security Exception: Failed to decrypt credentials. Integrity check failed or data was tampered with.',
        );
      }

      // JavaScript strings are immutable and cannot be reliably zeroized. The byte buffers
      // holding the DEK and decrypted key are wiped in the finally block below.
      return await executionCallback(decryptedAPIKeyString);
    } finally {
      this.secureWipeBuffer(plaintextDEK);
      this.secureWipeBuffer(decryptedKeyUpdateBuffer);
      this.secureWipeBuffer(decryptedKeyFinalBuffer);
      this.secureWipeBuffer(decryptedKeyBuffer);
    }
  }

  async DeleteCredential(userId: string, provider: string, dbClient: DbClient = db): Promise<void> {
    if (!userId) {
      throw new Error('User ID is required to delete credentials.');
    }
    if (!provider) {
      throw new Error('Provider is required to delete credentials.');
    }

    const normalizedProvider = provider.toLowerCase();

    await dbClient
      .delete(userExternalCredentials)
      .where(and(eq(userExternalCredentials.userId, userId), eq(userExternalCredentials.provider, normalizedProvider)));
  }

  async ListCredentials(userId: string) {
    if (!userId) {
      throw new Error('User ID is required to list credentials.');
    }

    return db
      .select({
        provider: userExternalCredentials.provider,
        preferredModel: userExternalCredentials.preferredModel,
        createdAt: userExternalCredentials.createdAt,
        updatedAt: userExternalCredentials.updatedAt,
      })
      .from(userExternalCredentials)
      .where(eq(userExternalCredentials.userId, userId))
      .orderBy(asc(userExternalCredentials.provider));
  }
}
