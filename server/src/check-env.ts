try {
  await import('./env.js');
  console.log('Deployment configuration is valid. Dependency availability is checked by /api/v1/health/ready.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid deployment configuration.');
  process.exitCode = 1;
}
