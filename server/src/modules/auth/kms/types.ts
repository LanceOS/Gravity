/**
 * @description Interface representing a Key Management Service (KMS) provider.
 * Implementations must provide secure generation and decryption of Data Encryption Keys (DEKs)
 * using a centralized Key Encryption Key (KEK).
 */
export interface IKMSProvider {
  /**
   * @description Generates a 256-bit (32-byte) Data Encryption Key (DEK).
   * @return {{ plaintextDEK: Buffer; encryptedDEK: Buffer; kekId: string }} An object containing:
   *  - plaintextDEK: The raw 32-byte key for immediate encryption (must be zeroized after use).
   *  - encryptedDEK: The DEK encrypted by the KMS/KEK for safe storage.
   *  - kekId: The identifier of the Key Encryption Key used to wrap the DEK.
   */
  GenerateDataKey(): { plaintextDEK: Buffer; encryptedDEK: Buffer; kekId: string };

  /**
   * @description Unwraps / decrypts an encrypted DEK and returns the plaintext version.
   * @param {Buffer} encryptedDEK - The wrapped DEK retrieved from storage.
   * @return {Buffer} The decrypted 32-byte plaintext DEK (must be zeroized after use).
   */
  DecryptDataKey(encryptedDEK: Buffer): Buffer;
}
