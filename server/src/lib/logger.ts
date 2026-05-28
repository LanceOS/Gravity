const SENSITIVE_KEY_RE = /(password|pass|token|rawtoken|secret|api[_-]?key|apikey|authorization|auth|access[_-]?token|refresh[_-]?token|hmac)/i;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function redactValue(key: string, value: unknown) {
  if (typeof value === 'string') {
    if (/authorization/i.test(key) && value.toLowerCase().startsWith('bearer ')) {
      return 'Bearer [REDACTED]';
    }
    return '[REDACTED]';
  }
  return '[REDACTED]';
}

function deepRedact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => deepRedact(v));
  if (!isPlainObject(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = redactValue(k, v);
      continue;
    }

    // Special-case headers to avoid leaking auth headers
    if (k === 'headers' && isPlainObject(v)) {
      const headersOut: Record<string, unknown> = {};
      for (const [hk, hv] of Object.entries(v)) {
        if (SENSITIVE_KEY_RE.test(hk)) {
          headersOut[hk] = redactValue(hk, hv);
        } else {
          headersOut[hk] = deepRedact(hv);
        }
      }
      out[k] = headersOut;
      continue;
    }

    // Avoid embedding full request objects (they can be circular or large).
    if (k === 'req' && isPlainObject(v)) {
      const safeReq: Record<string, unknown> = {};
      if (typeof (v as any).method === 'string') safeReq.method = (v as any).method;
      if (typeof (v as any).url === 'string') safeReq.url = (v as any).url;
      if (isPlainObject((v as any).headers)) {
        const headersOut: Record<string, unknown> = {};
        for (const [hk, hv] of Object.entries((v as any).headers as Record<string, unknown>)) {
          if (SENSITIVE_KEY_RE.test(hk)) headersOut[hk] = redactValue(hk, hv);
          else headersOut[hk] = deepRedact(hv);
        }
        safeReq.headers = headersOut;
      }
      out.req = safeReq;
      continue;
    }

    out[k] = deepRedact(v);
  }
  return out;
}

function extractTraceId(data?: Record<string, unknown>): string | undefined {
  if (!data) return undefined;
  if (typeof data.traceId === 'string') return data.traceId as string;
  if (typeof data.trace_id === 'string') return data.trace_id as string;
  const req = (data as any).req;
  const headers = req && req.headers;
  if (isPlainObject(headers)) {
    for (const key of ['x-request-id', 'x-trace-id', 'traceparent', 'x-b3-traceid', 'x-amzn-trace-id']) {
      const v = (headers as any)[key] || (headers as any)[key.toLowerCase()];
      if (typeof v === 'string') return v;
    }
  }
  return undefined;
}

function baseLog(level: string, messageOrEvent: string, data?: Record<string, unknown>, isAudit = false) {
  const ts = new Date().toISOString();
  const rawData = data || {};

  const traceId = extractTraceId(rawData);
  const redacted = deepRedact(rawData) as Record<string, unknown>;

  const log: Record<string, unknown> = { ts, level: isAudit ? undefined : level } as Record<string, unknown>;
  if (isAudit) log.event = messageOrEvent;
  else log.message = messageOrEvent;
  if (traceId) log.traceId = traceId;
  Object.assign(log, redacted);

  // eslint-disable-next-line no-console
  if (level === 'error') console.error(JSON.stringify(log));
  else if (level === 'warn') console.warn(JSON.stringify(log));
  else console.info(JSON.stringify(log));
}

export function audit(event: string, data: Record<string, unknown> = {}) {
  baseLog('info', event, data, true);
}

export function info(message: string, data?: Record<string, unknown>) {
  baseLog('info', message, data, false);
}

export function warn(message: string, data?: Record<string, unknown>) {
  baseLog('warn', message, data, false);
}

export function error(message: string, data?: Record<string, unknown>) {
  baseLog('error', message, data, false);
}

export default { audit, info, warn, error };
