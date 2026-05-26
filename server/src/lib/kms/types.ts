export interface IKMSProvider {
  /**
   * Generates a 256-bit (32-byte) Data Encryption Key (DEK).
   * Returns both the plaintext version (for immediate use) and the KEK-wrapped (encrypted) version.
   */
  GenerateDataKey(): { plaintextDEK: Buffer; encryptedDEK: Buffer; kekId: string };

  /**
   * Unwraps / decrypts an encrypted DEK and returns the plaintext version.
   */
  DecryptDataKey(encryptedDEK: Buffer): Buffer;
}
