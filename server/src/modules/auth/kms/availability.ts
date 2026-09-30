export const CREDENTIALS_DISABLED_MESSAGE = 'Encrypted credentials and cloud AI are disabled on this server because a supported KMS is unavailable. Contact your administrator.';

export class CredentialsUnavailableError extends Error {
  constructor() {
    super(CREDENTIALS_DISABLED_MESSAGE);
    this.name = 'CredentialsUnavailableError';
  }
}
