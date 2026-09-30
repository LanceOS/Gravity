import { env } from '../../../env.js';
import { CredentialManager } from './credential-manager.js';
import { createKmsProvider } from './provider.js';

export const credentialManager = new CredentialManager(
  createKmsProvider(env.nodeEnv, env.encryptedCredentialsMode),
  env.encryptedCredentialsMode !== 'disabled',
);

export type { IKMSProvider } from './types.js';
export { LocalEnvKmsProvider } from './local-provider.js';
export { CredentialManager } from './credential-manager.js';
