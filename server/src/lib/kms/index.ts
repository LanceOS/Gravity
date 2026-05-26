import { env } from '../../env.js';
import { CredentialManager } from './credential-manager.js';
import { LocalEnvKmsProvider } from './local-provider.js';
import { IKMSProvider } from './types.js';

let kmsProvider: IKMSProvider;

if (env.nodeEnv === 'development' || env.nodeEnv === 'test') {
  kmsProvider = new LocalEnvKmsProvider();
} else {
  // =========================================================================
  // PRODUCTION SECURE SECRET STORAGE CONFIGURATION (TODO)
  // =========================================================================
  // In production, we must instantiate a concrete CloudKmsProvider which wraps/unwraps
  // DEKs using a Cloud HSM or Managed Key Service (e.g. AWS KMS, Google Cloud KMS, HashiCorp Vault).
  //
  // Example future setup:
  // class CloudKmsProvider implements IKMSProvider { ... }
  // kmsProvider = new CloudKmsProvider();
  // =========================================================================
  throw new Error(
    'Production Configuration Failure: CloudKmsProvider is not yet implemented. ' +
    'Please implement and register CloudKmsProvider before deploying to production.'
  );
}

export const credentialManager = new CredentialManager(kmsProvider);

export { IKMSProvider } from './types.js';
export { LocalEnvKmsProvider } from './local-provider.js';
export { CredentialManager } from './credential-manager.js';
