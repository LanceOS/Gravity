import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('serviceTokens (file-backed refresh)', () => {
  const tmpDir = os.tmpdir();

  afterEach(async () => {
    // Clean module cache so env is re-evaluated in next test
    vi.resetModules();
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
});
