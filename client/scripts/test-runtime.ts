// Vitest 3's jsdom globals do not interoperate with Node 26's Web Storage and
// Request/AbortSignal globals. Keep the supported test runtime explicit until
// that environment is upgraded and verified together.
export function assertSupportedTestRuntime(version = process.versions.node) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (!/^\d+\.\d+\.\d+$/.test(version) || major !== 22 || minor < 22 || (minor === 22 && patch < 2)) {
    throw new Error(
      `Client Vitest tests require Node >=22.22.2 <23 (received ${version}). ` +
      'From client/, run `nvm install && nvm use`, then `npm test`. ' +
      'See client/README.md. Do not work around this with NODE_OPTIONS storage flags.',
    );
  }
}
