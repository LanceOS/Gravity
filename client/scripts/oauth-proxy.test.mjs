import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer, loadConfigFromFile } from 'vite';

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let backend;
let vite;
let fixtureRoot;
let frontendOrigin;

before(async () => {
  backend = createHttpServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      service: 'oauth-backend',
      url: request.url,
      method: request.method,
      body: Buffer.concat(chunks).toString(),
    }));
  });
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const target = `http://127.0.0.1:${backend.address().port}`;

  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, resolve(clientRoot, 'vite.config.ts'), clientRoot);
  assert.ok(loaded?.config.server?.proxy, 'The application must configure its development proxy');
  // Keep the application's matching rules and proxy options; only replace the
  // destination so this test cannot call a developer's running backend.
  const proxy = Object.fromEntries(Object.entries(loaded.config.server.proxy).map(([route, options]) => [
    route, { ...(typeof options === 'string' ? {} : options), target },
  ]));
  fixtureRoot = await mkdtemp(resolve(tmpdir(), 'gravity-oauth-proxy-'));
  await writeFile(resolve(fixtureRoot, 'index.html'), '<html><body>Gravity SPA fallback</body></html>');
  vite = await createViteServer({
    configFile: false,
    root: fixtureRoot,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: true, proxy, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await vite.listen();
  frontendOrigin = `http://127.0.0.1:${vite.httpServer.address().port}`;
});

after(async () => {
  await vite?.close();
  if (backend?.listening) await new Promise((resolve, reject) => backend.close(error => error ? reject(error) : resolve()));
  if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true });
});

test('proxies authorization requests with OAuth parameters unchanged', async () => {
  const path = '/authorize?client_id=client-1&response_type=code&code_challenge=test&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&state=a%2Bb';
  const response = await fetch(`${frontendOrigin}${path}`);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), { service: 'oauth-backend', url: path, method: 'GET', body: '' });
});

test('proxies discovery and token endpoints, including optional query parameters', async () => {
  for (const path of [
    '/.well-known/oauth-authorization-server',
    '/.well-known/oauth-authorization-server?version=test',
    '/.well-known/oauth-protected-resource/api/v1/workspaces/workspace-1/mcp',
  ]) {
    const response = await fetch(`${frontendOrigin}${path}`);
    assert.equal((await response.json()).url, path);
  }
  for (const path of ['/register', '/token?test=1', '/revoke']) {
    const body = 'grant_type=authorization_code&code=example';
    const response = await fetch(`${frontendOrigin}${path}`, { method: 'POST', body });
    assert.deepEqual(await response.json(), { service: 'oauth-backend', url: path, method: 'POST', body });
  }
});

test('keeps consent and unrelated similarly named routes in the SPA', async () => {
  for (const path of ['/oauth/consent?request=request-1', '/authorize-extra?client_id=test', '/tokenized']) {
    const response = await fetch(`${frontendOrigin}${path}`, { headers: { Accept: 'text/html' } });
    assert.match(await response.text(), /Gravity SPA fallback/);
  }
});
