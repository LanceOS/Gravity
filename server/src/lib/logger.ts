export function audit(event: string, data: Record<string, unknown> = {}) {
  const log = {
    ts: new Date().toISOString(),
    event,
    ...data,
  };
  // eslint-disable-next-line no-console
  console.info(JSON.stringify(log));
}

export function info(message: string, data?: Record<string, unknown>) {
  const log = { ts: new Date().toISOString(), level: 'info', message, ...(data || {}) };
  // eslint-disable-next-line no-console
  console.info(JSON.stringify(log));
}

export function warn(message: string, data?: Record<string, unknown>) {
  const log = { ts: new Date().toISOString(), level: 'warn', message, ...(data || {}) };
  // eslint-disable-next-line no-console
  console.warn(JSON.stringify(log));
}

export function error(message: string, data?: Record<string, unknown>) {
  const log = { ts: new Date().toISOString(), level: 'error', message, ...(data || {}) };
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(log));
}

export default { audit, info, warn, error };
