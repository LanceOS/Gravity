// Configuration and production feature boundaries: synthetic persistence only,
// no shared setup or external services. HTTP tests use ephemeral local listeners.
export default { test: { environment: 'node', cache: false, include: ['config-tests/*.test.ts'] } };
