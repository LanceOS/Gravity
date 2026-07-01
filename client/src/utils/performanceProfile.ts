let profileFlagCache: boolean | null = null;

function readProfileFlag(): boolean {
  if (profileFlagCache !== null) {
    return profileFlagCache;
  }

  if (typeof window === 'undefined') {
    profileFlagCache = false;
    return false;
  }

  try {
    profileFlagCache = window.localStorage.getItem('gravity-perf-profile') === '1';
    return profileFlagCache;
  } catch {
    profileFlagCache = false;
    return false;
  }
}

export function profileComputation<T>(label: string, callback: () => T): T {
  if (!readProfileFlag()) {
    return callback();
  }

  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const result = callback();
  const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const duration = end - start;

  console.info(`[gravity:perf] ${label}: ${duration.toFixed(2)}ms`);
  return result;
}
