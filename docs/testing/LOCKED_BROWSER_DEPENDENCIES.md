# Locked browser dependencies — GRAV-255

Local ignored dependencies are not acceptance evidence. A shared checkout's
`node_modules/animejs/lib/anime.js` claimed version 3.2.2 but contained a
lightweight offline mock that automatically cancelled earlier animations.
Genuine AnimeJS 3.2.2 does not do that. This masked the superseded tooltip exit
fixed in GRAV-245. The committed lockfile and CI installations were not implicated.
Do not repair or reuse another worktree's dependency tree for validation.

Every `client/scripts/*browser-test.mjs` entry point now bootstraps using only
Node built-ins before importing Playwright or a bundler. It:

1. Creates a fresh temporary directory and copies the current checkout's source
   (including uncommitted edits and nonignored new files). Git is required.
   Ignored files, installed dependencies, local environment files, and symlinks
   into other trees are excluded or rejected.
2. Runs `npm ci --ignore-scripts --include=dev --include=optional --workspace=client
   --include-workspace-root` with a private, initially empty npm cache. npm verifies
   downloaded tarball integrity against the committed lock. Installation failure
   aborts validation; there is no offline mock or shared-package fallback.
3. Starts the harness from that copy with the same Node executable, clearing
   `NODE_PATH` and `NODE_OPTIONS`. The child checks the lock and AnimeJS file hashes
   before loading packages, verifies client/library import resolution, and checks
   the CommonJS and browser module entry points. The temporary source, dependencies
   and cache are removed on normal completion, a caught failure, or SIGINT/SIGTERM.
   On Unix, interruption terminates the child process group before cleanup.

Use Node 22 or newer and an npm version compatible with that runtime. The initial
installation requires registry access. `GRAVITY_BROWSER_NPM` optionally selects
an npm executable (for example `/usr/bin/npm-22`). No Docker, server startup,
application data, or existing dependency directory is needed for static fixtures.
The existing production CSP harness still requires its explicitly supplied target
application; the receipt attests the local harness dependencies, not a remote
application's deployed bundle. Build deployed applications from clean locked
installs independently.

## Commands

```sh
/usr/bin/node-22 --test client/scripts/locked-browser-dependencies.test.mjs

GRAVITY_BROWSER_NPM=/usr/bin/npm-22 \
GRAVITY_PORTAL_BROWSER=/opt/brave.com/brave/brave \
GRAVITY_PORTAL_VITE_VERSION=vitest \
GRAVITY_PORTAL_TEST_ARTIFACTS=/tmp/gravity-portals \
GRAVITY_BROWSER_PROVENANCE=/tmp/gravity-dependency-provenance.json \
/usr/bin/node-22 client/scripts/portal-browser-test.mjs

GRAVITY_BROWSER_NPM=/usr/bin/npm-22 \
GRAVITY_PORTAL_BROWSER=/opt/brave.com/brave/brave \
GRAVITY_PORTAL_VITE_VERSION=vitest \
/usr/bin/node-22 client/scripts/tooltip-provenance-regression.mjs
```

`npm run -w client test:portal-browser`, `test:browser-dependencies`, and
`test:tooltip-provenance` expose the same checks. Each browser invocation installs
fresh dependencies. Existing browser/scenario environment options still apply.
Artifact paths are resolved against the caller’s working directory before launching
the disposable copy, so existing relative output destinations are preserved.

The portal harness defaults to locked Vite 8. On machines where its native
bundler cannot execute, `GRAVITY_PORTAL_VITE_VERSION=vitest` selects only the
lockfile's nested Vite 7 dependency. Arbitrary `GRAVITY_PORTAL_VITE_MODULE` paths
are rejected, including the former shared-tree workaround.

## Evidence and negative control

`DEPENDENCY_PROVENANCE` logs include the Node version, lock SHA-256, source
snapshot digest, AnimeJS version, registry tarball URL, lock SHA-512 integrity,
resolved client/library import paths, and SHA-256 of its package manifest and all three distributed JavaScript entry
points. `GRAVITY_BROWSER_PROVENANCE` saves this receipt. Portal `results.json`
also includes the receipt and browser version beside frame samples and assertions.
Keep that evidence with acceptance results; a version string alone is insufficient.

The tooltip provenance check first requires the real production fixture to pass
normal and reduced motion. It then removes only the entrance's
`anime.remove(tooltipElement)` in the disposable copy and reruns the same harness.
Success requires a failing original-node-preservation assertion with reentry at
exactly 50ms while the original exit is connected and partially faded. It fails if
the mutant passes or the browser crashes. Working-tree production code is never
mutated. The receipt's source digest describes the baseline; the negative control
explicitly changes that one line after the baseline run.

Verified on Node 22.22.2 with locked AnimeJS 3.2.2: the corrected tooltip passed both
motion modes, and the deliberate mutation was caught at 50ms, opacity 0.673587.
The genuine `lib/anime.js` SHA-256 was
`70b4ba88c4981f830754ab69ef08904437df54282d93b78245ac70e16fa59c07`.

Full portal acceptance passed all 36 scenarios on both default locked Vite 8
and the locked Vite 7 fallback. The negative control was caught on both toolchains.
The picker performance fixture, ticket review-regression fixture, and eleven
dependency/snapshot/lifecycle regression tests also passed. Caller-relative portal artifacts
survived temporary-tree cleanup. A fresh Vite 8 hover build succeeded but browser launch was blocked by
missing Playwright Chromium. Remaining engine checks are tracked in GRAV-261;
the isolated live-application CSP check is tracked in existing GRAV-210. Neither
is represented as a passing runtime check here.

## Critical review follow-up

The separate review added resolution checks so a nearer AnimeJS package cannot
shadow the attested root package. It also added interrupted-run cleanup, explicit
private npm cache/config arguments, source path bounds, and strict scenario/Vite
option validation. Regression tests cover Git's nonignored untracked source,
shadow packages, failed installs and SIGTERM cleanup, including an npm executable
whose filename contains spaces. The negative control requires a complete two-case
run with exactly one failure, in the original-node-preservation assertion.
