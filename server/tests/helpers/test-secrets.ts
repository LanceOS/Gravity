// Synthetic fixtures only. Share these defaults with explicitly constructed child
// environments so tests never need application secrets from the shell or .env.
export const testSecrets = {
  BETTER_AUTH_SECRET: 'test-secret-1234567890',
  BETTER_AUTH_OLD_SECRETS: '',
  NODE_IDENTITY_MASTER_KEY: 'test-node-master-key',
  LOCAL_TESTING_KEK: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
};
