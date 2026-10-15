import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { info } from './logger.js';

export const CSP_REPORT_PATH = '/api/v1/csp-reports';
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;
const MAX_REPORTS_PER_REQUEST = 20;

const knownDirectives = new Set([
  'base-uri', 'connect-src', 'default-src', 'font-src', 'form-action',
  'frame-ancestors', 'img-src', 'manifest-src', 'object-src', 'script-src',
  'script-src-attr', 'script-src-elem', 'style-src', 'style-src-attr',
  'style-src-elem', 'trusted-types', 'require-trusted-types-for',
]);
// Each key is drawn from a fixed directive × 11-kind vocabulary. Keeping the
// whole vocabulary prevents forged reports from hiding later real ones.
const MAX_BUCKETS = (knownDirectives.size + 1) * 11; // +1 for "other"

type Bucket = { directive: string; blockedKind: string; count: number };

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function directive(value: unknown): string {
  if (typeof value !== 'string') return 'other';
  const normalized = value.toLowerCase();
  return knownDirectives.has(normalized) ? normalized : 'other';
}

function blockedKind(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';
  const normalized = value.toLowerCase();
  if (normalized === 'inline' || normalized === 'eval' || normalized === 'wasm-eval') return normalized;
  if (normalized === 'self') return 'self';
  if (/^(?:data|blob|about|filesystem):/.test(normalized)) return normalized.split(':', 1)[0];
  if (/^https?:\/\//.test(normalized)) return 'network';
  return 'other';
}

function violation(value: unknown): Bucket | null {
  const entry = object(value);
  if (!entry) return null;
  // Legacy report-uri and Reporting API payloads have different envelopes.
  const legacy = object(entry['csp-report']);
  const body = legacy ?? (entry.type === 'csp-violation' ? object(entry.body) : null);
  if (!body) return null;
  const effective = body.effectiveDirective ?? body['effective-directive']
    ?? body.violatedDirective ?? body['violated-directive'];
  return {
    directive: directive(effective),
    blockedKind: blockedKind(body.blockedURL ?? body['blocked-uri'] ?? body.blockedURI),
    count: 1,
  };
}

/** One bounded, per-process minute of counts; no report body, URL, or IP is retained. */
export class CspReportCollector {
  private windowStarted = Date.now();
  private requests = 0;
  private droppedRequests = 0;
  private ignoredReports = 0;
  private buckets = new Map<string, Bucket>();
  private timer: NodeJS.Timeout | undefined;

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), Math.max(1, this.windowStarted + WINDOW_MS - Date.now()));
    this.timer.unref();
  }

  private advance() {
    if (Date.now() - this.windowStarted >= WINDOW_MS) this.flush();
    this.schedule();
  }

  allowRequest(): boolean {
    this.advance();
    if (this.requests >= MAX_REQUESTS_PER_WINDOW) {
      this.droppedRequests++;
      return false;
    }
    this.requests++;
    return true;
  }

  record(payload: unknown): void {
    // Body parsing is asynchronous. The preceding request may have crossed
    // the minute boundary while its bytes were arriving.
    this.advance();
    const entries = Array.isArray(payload) ? payload : [payload];
    for (const entry of entries.slice(0, MAX_REPORTS_PER_REQUEST)) {
      const bucket = violation(entry);
      if (!bucket) {
        this.ignoredReports++;
        continue;
      }
      const key = `${bucket.directive}:${bucket.blockedKind}`;
      const current = this.buckets.get(key);
      if (current) current.count++;
      else if (this.buckets.size < MAX_BUCKETS) this.buckets.set(key, bucket);
      else this.ignoredReports++;
    }
    this.ignoredReports += Math.max(0, entries.length - MAX_REPORTS_PER_REQUEST);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.requests || this.droppedRequests || this.ignoredReports || this.buckets.size) {
      try {
        info('csp_violations', {
          windowSeconds: WINDOW_MS / 1000,
          requests: this.requests,
          droppedRequests: this.droppedRequests,
          ignoredReports: this.ignoredReports,
          violations: [...this.buckets.values()].sort((a, b) =>
            a.directive.localeCompare(b.directive) || a.blockedKind.localeCompare(b.blockedKind)),
        });
      } catch {
        // A failed diagnostic sink must not take down the HTTP service.
      }
    }
    this.windowStarted = Date.now();
    this.requests = 0;
    this.droppedRequests = 0;
    this.ignoredReports = 0;
    this.buckets.clear();
  }
}

export function createCspReportRouter(collector = new CspReportCollector()) {
  const router = express.Router();
  const noStore: RequestHandler = (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  };
  const limit: RequestHandler = (_req, res, next) => {
    if (!collector.allowRequest()) {
      res.setHeader('Retry-After', '60');
      res.sendStatus(429);
      return;
    }
    next();
  };
  const accept: RequestHandler = (req, res) => {
    if (!req.is(['application/csp-report', 'application/reports+json'])) {
      res.sendStatus(415);
      return;
    }
    if (!Buffer.isBuffer(req.body)) {
      res.sendStatus(400);
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      res.sendStatus(400);
      return;
    }
    collector.record(payload);
    res.sendStatus(204);
  };
  router.post(CSP_REPORT_PATH, noStore,
    // Parse every content type so an unsupported type cannot bypass the byte cap.
    express.raw({ type: () => true, limit: '16kb', inflate: false }),
    limit, accept);
  const bodyError: ErrorRequestHandler = (error: unknown, _req, res) => {
    const parserError = object(error);
    if (parserError?.type === 'entity.too.large') res.sendStatus(413);
    else if (parserError?.type === 'encoding.unsupported') res.sendStatus(415);
    else res.sendStatus(400);
  };
  router.use(CSP_REPORT_PATH, bodyError);
  return router;
}
