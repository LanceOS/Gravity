import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as logger from '../../src/lib/logger.js';

describe('logger redaction and trace propagation', () => {
  let infoSpy: any;
  let warnSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts sensitive fields and headers and includes trace id', () => {
    const data = {
      token: 'supersecret',
      apiKey: 'sk-123',
      nested: { password: 'p' },
      req: { method: 'POST', url: '/login', headers: { Authorization: 'Bearer abc', 'x-request-id': 'rid-1' } },
      traceId: 'trace-1',
    };

    logger.info('testing', data);
    expect(infoSpy).toHaveBeenCalled();
    const logged = JSON.parse(infoSpy.mock.calls[0][0]);

    expect(logged.token).toBe('[REDACTED]');
    expect(logged.apiKey).toBe('[REDACTED]');
    expect(logged.nested.password).toBe('[REDACTED]');
    expect(logged.traceId).toBe('trace-1');
    expect(logged.req?.headers?.Authorization || logged.req?.headers?.authorization).toBe('Bearer [REDACTED]');

    // Ensure raw secrets are not present in the emitted JSON
    const raw = JSON.stringify(logged);
    expect(raw).not.toContain('supersecret');
    expect(raw).not.toContain('sk-123');
    expect(raw).not.toContain('abc');
  });

  it('audit includes trace id when present in headers', () => {
    logger.audit('evt', { req: { headers: { 'x-request-id': 'header-id' } } });
    expect(infoSpy).toHaveBeenCalled();
    const logged = JSON.parse(infoSpy.mock.calls[0][0]);
    expect(logged.traceId).toBe('header-id');
  });

  it('marks security failures as alertable errors and redacts sensitive context', () => {
    const delivered = logger.securityAlert('security.service_token_refresh_failed', {
      failureReason: 'configured_token_file_unreadable',
      token: 'supersecret',
    });

    expect(delivered).toBe(true);
    expect(errorSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(logged.level).toBe('error');
    expect(logged.message).toBe('security.service_token_refresh_failed');
    expect(logged.securityAlert).toBe(true);
    expect(logged.failureReason).toBe('configured_token_file_unreadable');
    expect(logged.token).toBe('[REDACTED]');
  });

  it('uses a non-sensitive stderr fallback when the primary alert sink fails', () => {
    errorSpy.mockImplementationOnce(() => {
      throw new Error('primary alert sink unavailable');
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const delivered = logger.securityAlert('security.service_token_refresh_failed', {
      failureReason: 'configured_token_file_unreadable',
      token: 'supersecret',
    });

    expect(delivered).toBe(true);
    expect(stderrSpy).toHaveBeenCalledOnce();
    const fallback = String(stderrSpy.mock.calls[0][0]);
    expect(fallback).toContain('security.service_token_refresh_failed');
    expect(fallback).toContain('configured_token_file_unreadable');
    expect(fallback).not.toContain('supersecret');
    expect(fallback).toContain('[REDACTED]');
  });
});
