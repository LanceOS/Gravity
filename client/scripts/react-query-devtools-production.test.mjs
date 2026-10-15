import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

test('production bundles exclude the query devtools module and diagnostic UI', async () => {
  const assets = join(import.meta.dirname, '../dist/assets');
  const files = (await readdir(assets)).filter((file) => file.endsWith('.js'));
  assert.ok(files.length > 0, 'build the client before checking its bundles');

  const bundle = (await Promise.all(files.map((file) => readFile(join(assets, file), 'utf8')))).join('\n');
  assert.doesNotMatch(bundle, /Gravity Cache DevTools|Query Cache DevTools|Invalidate All/);

  const maps = (await readdir(assets)).filter((file) => file.endsWith('.js.map'));
  assert.ok(maps.length > 0, 'build with --sourcemap hidden to verify included modules');
  const sources = (await Promise.all(maps.map(async (file) => {
    const map = JSON.parse(await readFile(join(assets, file), 'utf8'));
    return map.sources;
  }))).flat().map((source) => source.replaceAll('\\', '/'));

  assert.ok(sources.some((source) => source.endsWith('/src/App.tsx')), 'source maps must include App.tsx');
  assert.ok(
    sources.some((source) => source.endsWith('/src/utils/react-query-mock.tsx')),
    'source maps must include the query client mock used by App.tsx',
  );
  assert.ok(
    sources.every((source) => !source.includes('react-query-devtools')),
    'production source maps must not include any React Query devtools module',
  );
});
