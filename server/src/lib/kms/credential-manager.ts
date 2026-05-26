import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { userExternalCredentials } from '../../db/schema.js';
import { IKMSProvider } from './types.js';

export class CredentialManager {
  constructor(private readonly kmsProvider: IKMSProvider) {}

  /**
   * Helper to safely fill/zero out Buffers to avoid retaining secrets in memory.
   */
  private secureWipeBuffer(buf: Buffer | undefined | null): void {
    if (buf) {
      buf.fill(0);
    }
  }

  /**
   * Flow A: Encrypts and securely stores the user's external API key in the database
   * using envelope encryption (AES-256-GCM).
   */
  async StoreCredential(userId: string, plaintextAPIKey: string): Promise<void> {
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

      // 5. Save/Upsert the credential record to the database
      await db
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
   * Flow B: Retrieves and decrypts the user's API key, executes the callback with it,
   * and guarantees complete memory zeroization of the secrets when done.
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
