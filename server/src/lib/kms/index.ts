import { env } from '../../env.js';
import { CredentialManager } from './credential-manager.js';
import { LocalEnvKmsProvider } from './local-provider.js';
import { IKMSProvider } from './types.js';

let kmsProvider: IKMSProvider;

if (env.nodeEnv === 'development' || env.nodeEnv === 'test') {
  kmsProvider = new LocalEnvKmsProvider();
} else {
  class UnconfiguredKmsProvider implements IKMSProvider {
    GenerateDataKey(): { plaintextDEK: Buffer; encryptedDEK: Buffer; kekId: string } {
      throw new Error('Security Exception: KMS provider is not configured.');
    }

    DecryptDataKey(_encryptedDEK: Buffer): Buffer {
      throw new Error('Security Exception: KMS provider is not configured.');
    }
  }

  kmsProvider = new UnconfiguredKmsProvider();
}

export const credentialManager = new CredentialManager(kmsProvider);

export { IKMSProvider } from './types.js';
export { LocalEnvKmsProvider } from './local-provider.js';
export { CredentialManager } from './credential-manager.js';
