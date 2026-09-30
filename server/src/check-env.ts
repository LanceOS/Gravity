try {
  const { env } = await import('./env.js');
  if (env.encryptedCredentialsMode === 'disabled') console.warn('Encrypted credentials and cloud AI are disabled (ENCRYPTED_CREDENTIALS_MODE=disabled).');
  console.log('Deployment configuration is valid. Dependency availability is checked by /api/v1/health/ready.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid deployment configuration.');
  process.exitCode = 1;
}
