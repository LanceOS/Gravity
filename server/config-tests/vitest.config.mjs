// Environment parsing only: no database, shared setup, network or containers.
export default { test: { environment: 'node', cache: false, include: ['config-tests/*.test.ts'] } };
