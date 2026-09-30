import { expect, it } from 'vitest';
import { assertSupportedTestRuntime } from '../../scripts/test-runtime';
import pinnedVersion from '../../.nvmrc?raw';

it.each(['22.22.2', '22.22.3', '22.23.0'])(
  'accepts the verified release and newer Node 22 patches: %s', (version) => {
    expect(() => assertSupportedTestRuntime(version)).not.toThrow();
  },
);

it.each(['20.20.0', '22.12.0', '22.22.1', '23.0.0', '24.0.0', '26.7.0', '22.23.0-pre', '22', '22.22.NaN'])(
  'rejects unsupported releases with actionable guidance: %s', (version) => {
    expect(() => assertSupportedTestRuntime(version)).toThrow(
      `Client Vitest tests require Node >=22.22.2 <23 (received ${version}). ` +
      'From client/, run `nvm install && nvm use`, then `npm test`.',
    );
  },
);

it('accepts the checked-in version used by contributors and CI', () => {
  expect(() => assertSupportedTestRuntime(pinnedVersion.trim())).not.toThrow();
});
