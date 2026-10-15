import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

test('production JavaScript excludes the query devtools diagnostic UI', async () => {
  const assets = join(import.meta.dirname, '../dist/assets');
  const files = (await readdir(assets)).filter((file) => file.endsWith('.js'));
  assert.ok(files.length > 0, 'build the client before checking its bundles');

  const bundle = (await Promise.all(files.map((file) => readFile(join(assets, file), 'utf8')))).join('\n');
  assert.doesNotMatch(bundle, /Gravity Cache DevTools|Query Cache DevTools|Invalidate All/);
});
