import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { IKMSProvider } from './types.js';

export class LocalEnvKmsProvider implements IKMSProvider {
  private readonly kek: Buffer;

  constructor() {
    const kekStr = process.env.LOCAL_TESTING_KEK || '';
    if (!kekStr) {
      throw new Error(
        'Fatal Security Configuration Error: LOCAL_TESTING_KEK is missing from the environment. ' +
        'For local development, please add LOCAL_TESTING_KEK to your server/.env file. ' +
        'You can generate a secure key using: openssl rand -hex 32'
      );
    }

    // Support both 64-character hex string or 32-byte raw string
    if (kekStr.length === 64 && /^[0-9a-fA-F]+$/.test(kekStr)) {
      this.kek = Buffer.from(kekStr, 'hex');
    } else {
      this.kek = Buffer.from(kekStr, 'utf8');
    }

    if (this.kek.length !== 32) {
      throw new Error(
        `Fatal Security Configuration Error: LOCAL_TESTING_KEK must be exactly 32 bytes (256 bits). ` +
        `Current key resolves to ${this.kek.length} bytes.`
      );
    }
  }

  GenerateDataKey(): { plaintextDEK: Buffer; encryptedDEK: Buffer; kekId: string } {
    // Generate a 32-byte (256-bit) high-entropy DEK using CSPRNG
    const plaintextDEK = randomBytes(32);

    // Generate a secure, unique 12-byte IV for GCM (Never reuse an IV)
    const iv = randomBytes(12);

    // Encrypt the plaintext DEK using the KEK (LOCAL_TESTING_KEK)
    const cipher = createCipheriv('aes-256-gcm', this.kek, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintextDEK),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    // Pack into a single Buffer for self-contained storage: [12 bytes IV][16 bytes Auth Tag][ciphertext]
    const encryptedDEK = Buffer.concat([iv, tag, ciphertext]);

    return {
      plaintextDEK,
      encryptedDEK,
      kekId: 'local-env-mock'
    };
  }

  DecryptDataKey(encryptedDEK: Buffer): Buffer {
    if (encryptedDEK.length < 28) {
      throw new Error('Security Exception: Invalid or corrupted encrypted DEK.');
    }

    // Unpack [12 bytes IV][16 bytes Auth Tag][ciphertext]
    const iv = encryptedDEK.subarray(0, 12);
    const tag = encryptedDEK.subarray(12, 28);
    const ciphertext = encryptedDEK.subarray(28);

    try {
      const decipher = createDecipheriv('aes-256-gcm', this.kek, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ]);
    } catch (error) {
      throw new Error(
        `Security Exception: Failed to decrypt Data Encryption Key. Integrity check failed or KEK is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
