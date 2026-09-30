import { defineConfig } from 'vitest/config';

// Pure unit coverage: no database bootstrap, network services, or containers.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/csrf.proxy.test.ts', 'tests/unit/request-ip.test.ts', 'tests/unit/rate-limit.test.ts'],
  },
});
