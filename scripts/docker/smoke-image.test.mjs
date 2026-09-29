import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAssets } from './smoke-image.mjs';

const html = '<div id="root"></div><script src="/assets/app.js"></script><link href="/assets/app.css">';
function fixture(index = html, missing = false) {
  return async url => {
    const path = new URL(url).pathname;
    if (path === '/index.html' || missing) return new Response(index, { headers: { 'content-type': 'text/html' } });
    return new Response(path.endsWith('.js') ? 'console.log("app")' : 'body { color: black }', {
      headers: { 'content-type': path.endsWith('.js') ? 'application/javascript' : 'text/css' },
    });
  };
}
test('accepts compiled application assets', async () => {
  await checkAssets('http://fixture', fixture());
});
test('rejects the old fallback HTML', async () => {
  await assert.rejects(checkAssets('http://fixture', fixture('<h1>Frontend build failed</h1>')));
});
test('rejects SPA fallback masquerading as a missing asset', async () => {
  await assert.rejects(checkAssets('http://fixture', fixture(html, true)));
});
test('rejects missing CSS', async () => {
  await assert.rejects(checkAssets('http://fixture', fixture('<div id="root"></div><script src="/assets/app.js"></script>')));
});
