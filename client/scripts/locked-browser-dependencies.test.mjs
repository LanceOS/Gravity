import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, symlink, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { animationResolution, command, copySourceFiles, sourceFiles, verifyReceipt } from './locked-browser-dependencies.mjs';

const hash = (text) => createHash('sha256').update(text).digest('hex');
async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'gravity-provenance-unit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, 'node_modules/animejs/lib'), { recursive: true });
  await writeFile(resolve(root, 'package-lock.json'), 'locked');
  const animationFiles = {};
  for (const file of ['package.json', 'lib/anime.js', 'lib/anime.es.js', 'lib/anime.min.js']) {
    const path = `node_modules/animejs/${file}`;
    const bytes = file === 'package.json' ? JSON.stringify({ name: 'animejs', main: 'lib/anime.js', module: 'lib/anime.es.js' }) : 'genuine';
    await writeFile(resolve(root, path), bytes);
    animationFiles[path] = hash(bytes);
  }
  await writeFile(resolve(root, '.browser-dependencies.json'), JSON.stringify({ lockSha256: hash('locked'), animationFiles, animationResolution: animationResolution(root) }));
  return root;
}

test('receipt accepts the installed bytes and rejects a same-version offline replacement', async (t) => {
  const root = await fixture(t);
  await verifyReceipt(root);
  await writeFile(resolve(root, 'node_modules/animejs/lib/anime.js'), 'offline mock');
  await assert.rejects(verifyReceipt(root), /Animation dependency changed/);
});
test('receipt rejects changed locks and missing provenance', async (t) => {
  const root = await fixture(t);
  await writeFile(resolve(root, 'package-lock.json'), 'different');
  await assert.rejects(verifyReceipt(root), /Lockfile changed/);
  await rm(resolve(root, '.browser-dependencies.json'));
  await assert.rejects(verifyReceipt(root), /ENOENT/);
});
test('receipt rejects dependency symlinks even with identical bytes', async (t) => {
  const root = await fixture(t);
  const file = resolve(root, 'node_modules/animejs/lib/anime.js');
  await rm(file);
  await writeFile(resolve(root, 'external.js'), 'genuine');
  await symlink(resolve(root, 'external.js'), file);
  await assert.rejects(verifyReceipt(root), /must not be a symlink/);
});
test('every browser entry point isolates dependencies before importing external packages', async () => {
  for (const file of (await readdir(new URL('.', import.meta.url))).filter((name) => name.endsWith('browser-test.mjs'))) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /^import \{ ensureLockedBrowserDependencies \}.*\n(?:const dependencyProvenance = )?await ensureLockedBrowserDependencies\(import.meta.url\);/);
    assert.doesNotMatch(source, /import .* from ['"](?:playwright|vite|esbuild)['"]/);
  }
});

test('source snapshots exclude offline dependency trees and local environment files', async (t) => {
  const source = await fixture(t);
  const target = await mkdtemp(resolve(tmpdir(), 'gravity-source-unit-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  await writeFile(resolve(source, '.env.local'), 'secret');
  await writeFile(resolve(source, 'fixture.tsx'), 'source');
  const copied = await copySourceFiles(source, target, ['fixture.tsx', '.env.local', 'node_modules/animejs/lib/anime.js', 'deleted.tsx']);
  assert.deepEqual(Object.keys(copied), ['fixture.tsx']);
  assert.deepEqual(await readdir(target), ['fixture.tsx']);
});
test('source snapshots reject symlinks into another tree', async (t) => {
  const source = await fixture(t);
  await symlink(resolve(source, 'node_modules'), resolve(source, 'linked'));
  await assert.rejects(copySourceFiles(source, source, ['linked/animejs/lib/anime.js']), /must not traverse a symlink/);
});

test('receipt rejects a nested package that shadows the attested root dependency', async (t) => {
  const root = await fixture(t);
  await mkdir(resolve(root, 'client/node_modules/animejs'), { recursive: true });
  await writeFile(resolve(root, 'client/node_modules/animejs/package.json'), JSON.stringify({ main: 'index.js' }));
  await writeFile(resolve(root, 'client/node_modules/animejs/index.js'), 'offline mock');
  await assert.rejects(verifyReceipt(root), /Unexpected AnimeJS resolution/);
});
test('Git snapshots include new source and exclude ignored dependency and environment files', async (t) => {
  const root = await fixture(t);
  execFileSync('git', ['init', '--quiet', root]);
  await mkdir(resolve(root, 'client/scripts'), { recursive: true });
  await writeFile(resolve(root, '.gitignore'), 'node_modules/\n.env*\n');
  await writeFile(resolve(root, 'client/scripts/tracked.mjs'), 'tracked');
  execFileSync('git', ['add', '.gitignore', 'client/scripts/tracked.mjs'], { cwd: root });
  await writeFile(resolve(root, 'client/scripts/new.mjs'), 'new');
  await writeFile(resolve(root, 'client/.env.local'), 'secret');
  const files = sourceFiles(root);
  assert(files.includes('client/scripts/tracked.mjs'));
  assert(files.includes('client/scripts/new.mjs'));
  assert(!files.some((file) => file.includes('node_modules') || file.includes('.env')));
});
test('source copying rejects paths outside the selected checkout', async (t) => {
  const root = await fixture(t);
  await assert.rejects(copySourceFiles(root, root, ['../outside']), /escapes checkout/);
});
test('interruption terminates a running command and reports failure', { timeout: 10000 }, async () => {
  const controller = new AbortController();
  const running = command(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { signal: controller.signal, stdio: 'ignore' });
  controller.abort(new Error('test interruption'));
  await assert.rejects(running, /test interruption/);
});

test('bootstrap removes its private tree after install failure or interruption', { timeout: 20000 }, async (t) => {
  const { spawn } = await import('node:child_process');
  const { setTimeout: delay } = await import('node:timers/promises');
  const folder = await mkdtemp(resolve(tmpdir(), 'gravity-bootstrap-lifecycle-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const npm = resolve(folder, 'fake npm with spaces.mjs');
  await writeFile(npm, `#!${process.execPath}\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.GRAVITY_TEST_INSTALL_MARKER, process.cwd());\nif (process.env.GRAVITY_TEST_FAIL) process.exit(42);\nsetInterval(() => {}, 1000);\n`, { mode: 0o700 });
  for (const mode of ['failure', 'interruption']) {
    const marker = resolve(folder, mode);
    const child = spawn(process.execPath, [new URL('./portal-browser-test.mjs', import.meta.url).pathname], {
      stdio: 'ignore', env: { ...process.env, GRAVITY_BROWSER_NPM: npm, GRAVITY_LOCKED_BROWSER_ROOT: '',
        GRAVITY_PORTAL_VITE_MODULE: '', GRAVITY_PORTAL_VITE_VERSION: '',
        GRAVITY_TEST_INSTALL_MARKER: marker, GRAVITY_TEST_FAIL: mode === 'failure' ? '1' : '' },
    });
    t.after(() => child.kill('SIGKILL'));
    const closed = new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept); });
    let isolated;
    for (let attempt = 0; attempt < 200; attempt++) {
      try { isolated = await readFile(marker, 'utf8'); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await delay(50);
    }
    assert(isolated, `Fake npm must start for ${mode}`);
    if (mode === 'interruption') child.kill('SIGTERM');
    assert.notEqual(await closed, 0);
    await assert.rejects(readFile(resolve(isolated, 'package-lock.json')), /ENOENT/);
  }
});
