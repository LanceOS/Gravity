import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('serviceTokens (file-backed refresh)', () => {
  const tmpDir = os.tmpdir();

  afterEach(async () => {
    // Clean module cache so env is re-evaluated in next test
    vi.resetModules();
    vi.restoreAllMocks();
    delete process.env.TRUSTED_SERVICE_TOKENS_FILE;
    delete process.env.TRUSTED_SERVICE_TOKENS;
    delete process.env.TRUSTED_SERVICE_TOKENS_REFRESH_INTERVAL_MS;
  });

  it('loads tokens from a JSON array file', async () => {
    const tmp = path.join(tmpDir, `trusted_tokens_json_${Date.now()}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(['a', 'b']), 'utf8');

    // Ensure module reads the file at import time
    process.env.TRUSTED_SERVICE_TOKENS_FILE = tmp;
    vi.resetModules();
    const svc = await import('../../src/lib/serviceTokens.js');
    await svc.refreshFromSecretManager();

    expect(svc.getTrustedServiceTokens()).toEqual(['a', 'b']);
    await fs.unlink(tmp);
  });

  it('parses newline-separated token file', async () => {
    const tmp = path.join(tmpDir, `trusted_tokens_lines_${Date.now()}.tmp`);
    await fs.writeFile(tmp, 'one\ntwo\n', 'utf8');

    process.env.TRUSTED_SERVICE_TOKENS_FILE = tmp;
    vi.resetModules();
    const svc = await import('../../src/lib/serviceTokens.js');
    await svc.refreshFromSecretManager();

    expect(svc.getTrustedServiceTokens()).toEqual(['one', 'two']);
    await fs.unlink(tmp);
  });

  it('parses comma-separated token file', async () => {
    const tmp = path.join(tmpDir, `trusted_tokens_csv_${Date.now()}.tmp`);
    await fs.writeFile(tmp, 'x,y,z', 'utf8');

    process.env.TRUSTED_SERVICE_TOKENS_FILE = tmp;
    vi.resetModules();
    const svc = await import('../../src/lib/serviceTokens.js');
    await svc.refreshFromSecretManager();

    expect(svc.getTrustedServiceTokens()).toEqual(['x', 'y', 'z']);
    await fs.unlink(tmp);
  });

  it('falls back to env tokens when file is absent', async () => {
    process.env.TRUSTED_SERVICE_TOKENS = 'envA,envB';
    vi.resetModules();
    const svc = await import('../../src/lib/serviceTokens.js');
    await svc.refreshFromSecretManager();

    expect(svc.getTrustedServiceTokens()).toEqual(['envA', 'envB']);
  });

  it('alerts when the configured token file is missing before falling back to env tokens', async () => {
    process.env.TRUSTED_SERVICE_TOKENS_FILE = path.join(tmpDir, `missing_trusted_tokens_${Date.now()}.tmp`);
    process.env.TRUSTED_SERVICE_TOKENS = 'envA,envB';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
    const svc = await import('../../src/lib/serviceTokens.js');
    await svc.refreshFromSecretManager();

    expect(svc.getTrustedServiceTokens()).toEqual(['envA', 'envB']);
    const logged = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(logged.message).toBe('security.service_token_refresh_failed');
    expect(logged.securityAlert).toBe(true);
    expect(logged.failureReason).toBe('configured_token_file_missing');
  });

  it('suppresses repeated token-file alerts until a successful file refresh', async () => {
    const tmp = path.join(tmpDir, `deduped_trusted_tokens_${Date.now()}.tmp`);
    process.env.TRUSTED_SERVICE_TOKENS_FILE = tmp;
    process.env.TRUSTED_SERVICE_TOKENS = 'envA,envB';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
    const svc = await import('../../src/lib/serviceTokens.js');

    try {
      await svc.refreshFromSecretManager();
      await svc.refreshFromSecretManager();
      expect(errorSpy).toHaveBeenCalledOnce();

      await fs.writeFile(tmp, 'fileA,fileB', 'utf8');
      await svc.refreshFromSecretManager();
      expect(svc.getTrustedServiceTokens()).toEqual(['fileA', 'fileB']);

      await fs.unlink(tmp);
      await svc.refreshFromSecretManager();
      expect(errorSpy).toHaveBeenCalledTimes(2);
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  });

  it('retries an alert when every alert sink rejects the first delivery', async () => {
    const tmp = path.join(tmpDir, `retry_trusted_tokens_${Date.now()}.tmp`);
    process.env.TRUSTED_SERVICE_TOKENS_FILE = tmp;
    process.env.TRUSTED_SERVICE_TOKENS = 'envA,envB';
    const errorSpy = vi.spyOn(console, 'error')
      .mockImplementationOnce(() => {
        throw new Error('primary alert sink unavailable');
      })
      .mockImplementation(() => {});
    vi.spyOn(process.stderr, 'write').mockImplementationOnce(() => {
      throw new Error('fallback alert sink unavailable');
    });
    vi.resetModules();
    const svc = await import('../../src/lib/serviceTokens.js');

    await svc.refreshFromSecretManager();
    await svc.refreshFromSecretManager();

    expect(errorSpy).toHaveBeenCalledTimes(2);
  });
});
