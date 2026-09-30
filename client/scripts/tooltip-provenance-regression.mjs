import { ensureLockedBrowserDependencies } from './locked-browser-dependencies.mjs';
await ensureLockedBrowserDependencies(import.meta.url);
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

// Mutation is confined to the launcher's disposable source copy. Never change
// the working tree, dependency files, or shared application state.
const tooltip = fileURLToPath(new URL('../../library/components/tooltip/Tooltip.tsx', import.meta.url));
const harness = fileURLToPath(new URL('./portal-browser-test.mjs', import.meta.url));
const original = await readFile(tooltip, 'utf8');
const cancellation = "      anime.remove(tooltipElement);\n      tooltipElement.style.opacity = '0';";
assert.equal(original.split(cancellation).length, 2, 'Expected exactly one entrance cancellation to mutate');
const env = { ...process.env, GRAVITY_PORTAL_SCENARIOS: 'tooltip', GRAVITY_PORTAL_REPORT_ONLY: '0' };
delete env.GRAVITY_PORTAL_TEST_ARTIFACTS;
const run = () => promisify(execFile)(process.execPath, [harness], { env, maxBuffer: 1024 * 1024 });
const baseline = await run();
console.info(baseline.stdout);
try {
  await writeFile(tooltip, original.replace(cancellation, "      tooltipElement.style.opacity = '0';"));
  let failure;
  try { await run(); } catch (error) { failure = error; }
  assert(failure, 'Negative control unexpectedly passed: the superseded exit must be detected');
  assert.equal(failure.code, 1, 'Negative control must fail an assertion, not crash');
  assert.match(failure.stderr, /reentering during exit preserves the mounted tooltip/);
  assert.match(failure.stdout, /2 browser scenarios; 1 failures/); // Complete run, only the intended failure.
  assert.match(failure.stdout, /"elapsedMs":50,"connected":true,"opacity":0\./);
  console.info('PASS: genuine locked AnimeJS detects the deliberately superseded tooltip exit');
} finally {
  await writeFile(tooltip, original);
}
