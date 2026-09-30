// Only Node built-ins may be loaded before the isolated install is ready.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const receiptName = '.browser-dependencies.json';
const animationPaths = ['package.json', 'lib/anime.js', 'lib/anime.es.js', 'lib/anime.min.js'].map((file) => `node_modules/animejs/${file}`);

export async function command(executable, args, { signal, ...options } = {}) {
  signal?.throwIfAborted();
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { stdio: 'inherit', detached: process.platform !== 'win32', ...options });
    let killTimer;
    const kill = (value) => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, value);
        else child.kill(value);
      } catch (error) { if (error.code !== 'ESRCH') reject(error); }
    };
    const abort = () => {
      kill('SIGTERM');
      killTimer = setTimeout(() => kill('SIGKILL'), 5000);
      killTimer.unref();
    };
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', reject);
    child.on('close', (code, childSignal) => {
      signal?.removeEventListener('abort', abort);
      clearTimeout(killTimer);
      if (signal?.aborted && process.platform !== 'win32') kill('SIGKILL');
      if (signal?.aborted) reject(signal.reason);
      else if (code === 0) accept();
      else reject(new Error(`${executable} failed (${childSignal || code})`));
    });
  });
}

export function animationResolution(directory) {
  const resolutions = {};
  for (const importer of ['client/scripts/portal-browser-test.mjs', 'library/utilities/anime.ts']) {
    const require = createRequire(resolve(directory, importer));
    // Check the filesystem too: Node caches successful resolution, which must
    // not hide a newly introduced nearer package on subsequent verification.
    for (const searchPath of require.resolve.paths('animejs')) {
      if (searchPath === resolve(directory, 'node_modules')) break;
      assert(!existsSync(resolve(searchPath, 'animejs')), `Unexpected AnimeJS resolution from ${importer}`);
    }
    const entry = require.resolve('animejs');
    assert.equal(entry, resolve(directory, 'node_modules/animejs/lib/anime.js'), `Unexpected AnimeJS resolution from ${importer}`);
    resolutions[importer] = relative(directory, entry);
  }
  return resolutions;
}

export function sourceFiles(directory) {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--',
    'package.json', 'package-lock.json', 'client', 'library', 'server/package.json', 'server/src'],
  { cwd: directory }).toString().split('\0').filter(Boolean);
}

export async function verifyReceipt(directory) {
  const receipt = JSON.parse(await readFile(resolve(directory, receiptName), 'utf8'));
  assert.equal(digest(await readFile(resolve(directory, 'package-lock.json'))), receipt.lockSha256, 'Lockfile changed after installation');
  assert.deepEqual(Object.keys(receipt.animationFiles).sort(), [...animationPaths].sort(), 'Animation provenance must cover every distributed entry point');
  for (const [path, hash] of Object.entries(receipt.animationFiles)) {
    assert.equal(await realpath(resolve(directory, path)), resolve(directory, path), 'Animation dependency must not be a symlink');
    assert.equal(digest(await readFile(resolve(directory, path))), hash, `Animation dependency changed: ${path}`);
  }
  assert.deepEqual(animationResolution(directory), receipt.animationResolution, 'AnimeJS import resolution changed');
  const manifest = JSON.parse(await readFile(resolve(directory, 'node_modules/animejs/package.json'), 'utf8'));
  assert.equal(manifest.main, 'lib/anime.js', 'Unexpected AnimeJS CommonJS entry');
  assert.equal(manifest.module, 'lib/anime.es.js', 'Unexpected AnimeJS browser module');
  return receipt;
}

export async function copySourceFiles(sourceRoot, directory, files) {
  const sourceHashes = {};
  for (const file of files) {
    if (file.split('/').some((part) => part === 'node_modules' || part === '.env' || part.startsWith('.env.'))) continue;
    const source = resolve(sourceRoot, file);
    assert(!isAbsolute(file) && source.startsWith(`${sourceRoot}${sep}`), `Source path escapes checkout: ${file}`);
    let stat;
    try { stat = await lstat(source); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    assert(stat.isFile(), `Source must be a regular file: ${file}`);
    assert.equal(await realpath(source), source, `Source must not traverse a symlink: ${file}`);
    await mkdir(dirname(resolve(directory, file)), { recursive: true });
    await copyFile(source, resolve(directory, file));
    sourceHashes[file] = digest(await readFile(resolve(directory, file)));
  }
  return sourceHashes;
}

export async function ensureLockedBrowserDependencies(entryUrl) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Browser acceptance requires Node 22 or newer.');
  if (process.env.GRAVITY_PORTAL_VITE_MODULE) throw new Error('Arbitrary Vite module overrides are not accepted. Use GRAVITY_PORTAL_VITE_VERSION=vitest for the locked Vite 7 fallback.');
  assert(['', 'vitest'].includes(process.env.GRAVITY_PORTAL_VITE_VERSION || ''), 'GRAVITY_PORTAL_VITE_VERSION must be unset or vitest');
  if (process.env.GRAVITY_LOCKED_BROWSER_ROOT === root) {
    const receipt = await verifyReceipt(root);
    console.info(`DEPENDENCY_PROVENANCE ${JSON.stringify(receipt)}`);
    return receipt;
  }
  const directory = await mkdtemp(resolve(tmpdir(), 'gravity-locked-browser-'));
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error('Browser validation interrupted'));
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    // Copy current tracked and untracked source, never ignored dependencies,
    // local .env files, or symlinks that could escape into another worktree.
    const sourceHashes = await copySourceFiles(root, directory, sourceFiles(root));
    controller.signal.throwIfAborted();
    const env = { ...process.env, NODE_ENV: 'development', NODE_PATH: '', NODE_OPTIONS: '',
      npm_config_cache: resolve(directory, '.npm-cache'), npm_config_userconfig: resolve(directory, '.npmrc'),
      GRAVITY_LOCKED_BROWSER_ROOT: directory };
    // Preserve caller-relative output destinations outside the disposable copy.
    for (const key of ['GRAVITY_PORTAL_TEST_ARTIFACTS', 'GRAVITY_FOCUS_TEST_ARTIFACTS',
      'GRAVITY_SIDEBAR_TEST_ARTIFACTS', 'TICKET_PERF_REPORT', 'TICKET_PERF_SCREENSHOTS']) {
      if (env[key]) env[key] = resolve(env[key]);
    }
    // npm's tarball integrity validation plus an empty tree/cache prevents
    // ignored, hand-edited packages from entering this validation build.
    await command(process.env.GRAVITY_BROWSER_NPM || 'npm', ['ci', '--ignore-scripts', '--include=dev', '--include=optional',
      '--workspace=client', '--include-workspace-root', '--no-audit', '--no-fund',
      '--cache', env.npm_config_cache, '--userconfig', env.npm_config_userconfig], { cwd: directory, env, signal: controller.signal });
    const lockBytes = await readFile(resolve(directory, 'package-lock.json'));
    const lock = JSON.parse(lockBytes);
    const animation = lock.packages['node_modules/animejs'];
    assert(animation?.integrity && animation?.resolved, 'AnimeJS must have locked registry provenance');
    const installedAnimation = JSON.parse(await readFile(resolve(directory, 'node_modules/animejs/package.json'), 'utf8'));
    assert.equal(installedAnimation.name, 'animejs');
    assert.equal(installedAnimation.version, animation.version, 'Installed AnimeJS must match the lock');
    const animationFiles = {};
    for (const path of animationPaths) {
      animationFiles[path] = digest(await readFile(resolve(directory, path)));
    }
    const receipt = { node: process.version, lockSha256: digest(lockBytes), animation: {
      version: animation.version, resolved: animation.resolved, integrity: animation.integrity },
      animationFiles, animationResolution: animationResolution(directory), sourceSha256: digest(JSON.stringify(sourceHashes)) };
    await writeFile(resolve(directory, receiptName), JSON.stringify(receipt, null, 2));
    if (process.env.GRAVITY_BROWSER_PROVENANCE) await writeFile(resolve(process.env.GRAVITY_BROWSER_PROVENANCE), JSON.stringify(receipt, null, 2));
    await command(process.execPath, [resolve(directory, relative(root, fileURLToPath(entryUrl))), ...process.argv.slice(2)], { cwd: resolve(directory, 'client'), env, signal: controller.signal });
  } finally {
    try { await rm(directory, { recursive: true, force: true }); } finally {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    }
  }
  process.exit(0);
}
