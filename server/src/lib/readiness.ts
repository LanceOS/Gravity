export type Dependency = { required: boolean; check: (signal: AbortSignal) => Promise<boolean> };
export type Readiness = {
  status: 'ok' | 'degraded' | 'unavailable';
  checks: Record<string, { required: boolean; status: 'ok' | 'unavailable' }>;
};

// Share each outstanding probe, including after a timeout, so an unresponsive
// dependency cannot accumulate work on every health request.
export function createReadinessCheck(dependencies: Record<string, Dependency>, timeoutMs = 2000) {
  const pending = new Map<string, Promise<boolean>>();
  return async (): Promise<Readiness> => {
    const entries = await Promise.all(Object.entries(dependencies).map(async ([name, dependency]) => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (!pending.has(name)) {
        const probe = Promise.resolve().then(() => dependency.check(controller.signal)).catch(() => false);
        pending.set(name, probe);
        void probe.then(() => { if (pending.get(name) === probe) pending.delete(name); });
      }
      const available = await Promise.race([
        pending.get(name)!,
        new Promise<false>(resolve => {
          timer = setTimeout(() => { controller.abort(); resolve(false); }, timeoutMs);
        }),
      ]);
      clearTimeout(timer);
      return [name, { required: dependency.required, status: available ? 'ok' : 'unavailable' }] as const;
    }));
    const checks = Object.fromEntries(entries);
    const failed = Object.values(checks).filter(check => check.status === 'unavailable');
    return { status: failed.some(check => check.required) ? 'unavailable' : failed.length ? 'degraded' : 'ok', checks };
  };
}
