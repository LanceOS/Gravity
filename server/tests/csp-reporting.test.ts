import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CspReportCollector, CSP_REPORT_PATH, createCspReportRouter } from '../src/lib/csp-reporting.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CSP reporting', () => {
  it('accepts browser formats and rejects unsupported, malformed, and oversized bodies', async () => {
    const app = express().use(createCspReportRouter());

    const legacy = await request(app).post(CSP_REPORT_PATH)
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify({ 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'inline' } }));
    expect(legacy.status).toBe(204);
    expect(legacy.headers['cache-control']).toBe('no-store');

    const modern = await request(app).post(CSP_REPORT_PATH)
      .set('Content-Type', 'application/reports+json')
      .send(JSON.stringify([{ type: 'csp-violation', body: { effectiveDirective: 'connect-src', blockedURL: 'https://evil.example/private' } }]));
    expect(modern.status).toBe(204);

    expect((await request(app).post(CSP_REPORT_PATH).set('Content-Type', 'application/json').send('{}')).status).toBe(415);
    expect((await request(app).post(CSP_REPORT_PATH).set('Content-Type', 'text/plain').send('x'.repeat(17_000))).status).toBe(413);
    expect((await request(app).post(CSP_REPORT_PATH).set('Content-Type', 'application/csp-report').send('{')).status).toBe(400);
    expect((await request(app).post(CSP_REPORT_PATH).set('Content-Type', 'application/csp-report').send('x'.repeat(17_000))).status).toBe(413);
    expect((await request(app).post(CSP_REPORT_PATH).set('Content-Type', 'application/csp-report')
      .set('Content-Encoding', 'gzip').send('plain bytes')).status).toBe(415);
  });

  it('enforces the byte cap even after the report quota is exhausted', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const collector = new CspReportCollector();
    for (let index = 0; index < 120; index++) collector.allowRequest();
    const app = express().use(createCspReportRouter(collector));

    const oversized = await request(app).post(CSP_REPORT_PATH)
      .set('Content-Type', 'application/csp-report').send('x'.repeat(17_000));
    expect(oversized.status).toBe(413);
    expect(oversized.headers['cache-control']).toBe('no-store');
    const limited = await request(app).post(CSP_REPORT_PATH)
      .set('Content-Type', 'application/csp-report').send('{}');
    expect(limited.status).toBe(429);
    collector.flush();
  });

  it('aggregates only fixed categories and never logs URLs or document content', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const collector = new CspReportCollector();
    const privateUrl = 'https://gravity.test/workspaces/secret?token=private';
    const blockedUrl = 'https://secret.example/private-document';

    expect(collector.allowRequest()).toBe(true);
    collector.record({ 'csp-report': {
      'effective-directive': 'script-src', 'blocked-uri': blockedUrl,
      'document-uri': privateUrl, 'script-sample': 'private document content',
    } });
    expect(collector.allowRequest()).toBe(true);
    collector.record([{ type: 'csp-violation', body: {
      effectiveDirective: 'script-src', blockedURL: 'https://other.example/another-secret',
      documentURL: privateUrl, sample: 'more private content',
    } }]);
    collector.record({ 'csp-report': {
      'effective-directive': privateUrl, 'blocked-uri': 'data:text/html,private content',
    } });
    collector.flush();

    const output = String(log.mock.calls[0]?.[0]);
    expect(output).toContain('"directive":"script-src","blockedKind":"network","count":2');
    expect(output).not.toContain('secret.example');
    expect(output).not.toContain('gravity.test');
    expect(output).not.toContain('private document content');
    expect(output).not.toContain('data:text/html');
    expect(output).not.toContain('privateUrl');
  });

  it('does not log untrusted report fields or forwarded request headers', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const collector = new CspReportCollector();
    const app = express().use(createCspReportRouter(collector));
    const response = await request(app).post(CSP_REPORT_PATH)
      .set('Content-Type', 'application/csp-report')
      .set('X-Forwarded-For', '203.0.113.47')
      .set('Referer', 'https://gravity.test/private-document')
      .set('Cookie', 'session=private-cookie')
      .set('Authorization', 'Bearer private-token')
      .send(JSON.stringify({ 'csp-report': {
        'effective-directive': 'script-src',
        'blocked-uri': 'https://secret.example/private',
        'document-uri': 'https://gravity.test/private-document',
      } }));
    expect(response.status).toBe(204);
    collector.flush();

    const output = String(log.mock.calls[0]?.[0]);
    expect(output).toContain('"directive":"script-src","blockedKind":"network","count":1');
    for (const secret of ['203.0.113.47', 'private-document', 'private-cookie', 'private-token', 'secret.example']) {
      expect(output).not.toContain(secret);
    }
  });

  it('bounds accepted requests and report entries within one window', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const collector = new CspReportCollector();
    for (let index = 0; index < 120; index++) expect(collector.allowRequest()).toBe(true);
    expect(collector.allowRequest()).toBe(false);
    collector.record(Array.from({ length: 100 }, () => ({
      'csp-report': { 'effective-directive': 'style-src', 'blocked-uri': 'inline' },
    })));
    collector.flush();

    const output = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(output.requests).toBe(120);
    expect(output.droppedRequests).toBe(1);
    expect(output.ignoredReports).toBe(80);
    expect(output.violations).toEqual([{ directive: 'style-src', blockedKind: 'inline', count: 20 }]);
  });

  it('retains every fixed category even after more than 32 distinct groups', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const collector = new CspReportCollector();
    collector.allowRequest();
    for (const directive of ['script-src', 'style-src', 'connect-src', 'img-src', 'font-src']) {
      for (const blocked of ['inline', 'eval', 'wasm-eval', 'self', 'data:x', 'blob:x',
        'about:x', 'filesystem:x', 'https://example.test/private']) {
        collector.record({ 'csp-report': { 'effective-directive': directive, 'blocked-uri': blocked } });
      }
    }
    collector.flush();

    const output = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(output.violations).toHaveLength(45);
    expect(output.ignoredReports).toBe(0);
  });

  it('flushes aggregate counts after one minute and starts a fresh window', () => {
    vi.useFakeTimers();
    try {
      const log = vi.spyOn(console, 'info').mockImplementation(() => {});
      const collector = new CspReportCollector();
      expect(collector.allowRequest()).toBe(true);
      collector.record({ 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'inline' } });
      vi.advanceTimersByTime(60_000);
      expect(log).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(log.mock.calls[0]?.[0])).violations[0].count).toBe(1);
      expect(collector.allowRequest()).toBe(true);
      collector.flush();
      expect(JSON.parse(String(log.mock.calls[1]?.[0])).violations).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a report whose body arrives after the minute boundary', () => {
    vi.useFakeTimers();
    try {
      const log = vi.spyOn(console, 'info').mockImplementation(() => {});
      const collector = new CspReportCollector();
      expect(collector.allowRequest()).toBe(true);
      vi.advanceTimersByTime(60_000);
      collector.record({ 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'inline' } });
      vi.advanceTimersByTime(60_000);

      expect(log).toHaveBeenCalledTimes(2);
      const lateWindow = JSON.parse(String(log.mock.calls[1]?.[0]));
      expect(lateWindow.requests).toBe(0);
      expect(lateWindow.violations).toEqual([{ directive: 'script-src', blockedKind: 'inline', count: 1 }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the report endpoint available when its diagnostic log sink fails', () => {
    vi.spyOn(console, 'info').mockImplementation(() => { throw new Error('log unavailable'); });
    const collector = new CspReportCollector();
    expect(collector.allowRequest()).toBe(true);
    collector.record({ 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'inline' } });
    expect(() => collector.flush()).not.toThrow();
    expect(collector.allowRequest()).toBe(true);
    collector.flush();
  });
});
