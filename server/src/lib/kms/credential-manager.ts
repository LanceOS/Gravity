import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { userExternalCredentials } from '../../db/schema.js';
import { IKMSProvider } from './types.js';

/**
 * @description Manages the secure storage and retrieval of external credentials (e.g., API keys).
 * Uses envelope encryption to protect credentials at rest. Relies on an injected KMS provider
 * to handle Data Encryption Keys (DEKs). Enforces zeroization of sensitive memory.
 */
export class CredentialManager {
  constructor(private readonly kmsProvider: IKMSProvider) {}

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
  async StoreCredential(userId: string, plaintextAPIKey: string, dbClient: typeof db = db): Promise<void> {
    if (!userId) {
      throw new Error('User ID is required to store credentials.');
    }
    if (!plaintextAPIKey) {
      throw new Error('API Key cannot be empty.');
    }

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
      await dbClient
        .insert(userExternalCredentials)
        .values({
          userId,
          encryptedApiKey: ciphertext,
          encryptedDek: encryptedDEK,
          aesIv: iv,
          aesAuthTag: authTag,
          kmsKekId: kekId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userExternalCredentials.userId,
          set: {
            encryptedApiKey: ciphertext,
            encryptedDek: encryptedDEK,
            aesIv: iv,
            aesAuthTag: authTag,
            kmsKekId: kekId,
            updatedAt: new Date(),
          },
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
   * and guarantees complete memory zeroization of the secrets when done.
   * @param {string} userId - The unique identifier of the user.
   * @param {(decryptedAPIKey: string) => Promise<T> | T} executionCallback - The function to execute with the decrypted key.
   * @return {Promise<T>} The result of the execution callback.
   * @throws {Error} If credentials are not found, or if decryption/integrity check fails.
   */
  async ExecuteWithCredential<T>(
    userId: string,
    executionCallback: (decryptedAPIKey: string) => Promise<T> | T
  ): Promise<T> {
    if (!userId) {
      throw new Error('User ID is required to execute with credentials.');
    }

    // 1. Fetch user's record from database
    const [record] = await db
      .select()
      .from(userExternalCredentials)
      .where(eq(userExternalCredentials.userId, userId))
      .limit(1);

    if (!record) {
      throw new Error(`Security Exception: No external credentials found for user ${userId}`);
    }

    let plaintextDEK: Buffer | null = null;
    let decryptedKeyBuffer: Buffer | null = null;

    try {
      // 2. Call DecryptDataKey to unwrap the DEK
      plaintextDEK = this.kmsProvider.DecryptDataKey(record.encryptedDek);

      // 3. Decrypt the API key using AES-256-GCM and verify integrity
      const decipher = createDecipheriv('aes-256-gcm', plaintextDEK, record.aesIv);
      decipher.setAuthTag(record.aesAuthTag);

      decryptedKeyBuffer = Buffer.concat([
        decipher.update(record.encryptedApiKey),
        decipher.final()
      ]);

      const decryptedAPIKeyString = decryptedKeyBuffer.toString('utf8');

      // 4. Pass decrypted key to callback
      return await executionCallback(decryptedAPIKeyString);
    } catch (error) {
      throw new Error(
        `Security Exception: Failed to decrypt credentials. Integrity check failed or data was tampered with: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      // 5. Ensure plaintext secrets are securely wiped from memory inside a finally block
      if (plaintextDEK) {
        this.secureWipeBuffer(plaintextDEK);
      }
      if (decryptedKeyBuffer) {
        this.secureWipeBuffer(decryptedKeyBuffer);
      }
    }
  }
}
