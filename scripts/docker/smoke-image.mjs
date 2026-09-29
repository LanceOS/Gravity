import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export async function checkAssets(base, fetchImpl = fetch) {
  const response = await fetchImpl(`${base}/index.html`, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200, `${base}: application HTML missing`);
  const html = await response.text();
  assert.match(html, /id=["']root["']/, 'React mount point missing');
  const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)].map(m => m[1]);
  assert(assets.some(path => path.endsWith('.js')), 'Compiled JavaScript missing');
  assert(assets.some(path => path.endsWith('.css')), 'Compiled CSS missing');
  for (const path of assets) {
    const url = new URL(path, base);
    assert.equal(url.origin, new URL(base).origin, 'Expected local build assets');
    const asset = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
    assert.equal(asset.status, 200, `Missing asset: ${url}`);
    assert.match(asset.headers.get('content-type') ?? '', path.endsWith('.js') ? /javascript/ : /text\/css/);
    const body = await asset.text();
    assert(body.trim().length > 0, `Empty asset: ${url}`);
    assert(!/^\s*</.test(body), `HTML fallback returned for asset: ${url}`);
  }
}

export async function smoke() {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:8080/', { signal: AbortSignal.timeout(2000) });
      const health = await response.json();
      if (response.ok && health.name === 'gravity-server' && health.status === 'ready') {
        ready = true;
        break;
      }
    } catch { /* Wait for the real entrypoint and database bootstrap. */ }
    await setTimeout(1000);
  }
  assert(ready, 'Server did not finish startup');
  await checkAssets('http://127.0.0.1:8080');
  await checkAssets('http://127.0.0.1:5173');
  console.log('Server startup and both image asset checks passed');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await smoke();
}
