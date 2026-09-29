// Pure mocks only: no shared setup, database, Redis, object storage or containers.
export default { test: { environment: 'node', cache: false, include: ['health-tests/*.test.ts'] } };
