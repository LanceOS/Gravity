import { LocalEnvKmsProvider } from './local-provider.js';
import { CredentialsUnavailableError } from './availability.js';
import type { IKMSProvider } from './types.js';

class DisabledKmsProvider implements IKMSProvider {
  GenerateDataKey(): ReturnType<IKMSProvider['GenerateDataKey']> {
    throw new CredentialsUnavailableError();
  }

  DecryptDataKey(_encryptedDEK: Buffer): Buffer {
    throw new CredentialsUnavailableError();
  }
}

export function createKmsProvider(nodeEnv: string, mode: 'disabled' | 'required'): IKMSProvider {
  if (mode === 'disabled') return new DisabledKmsProvider();
  if (nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new Error('Required encrypted credentials are unavailable: no production KMS provider is supported.');
  }
  return new LocalEnvKmsProvider();
}
