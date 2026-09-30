# Client lint baseline

Run the client checks using Node 22 and this checkout's locked dependencies:

```sh
npm ci --ignore-scripts
npm run -w client lint
npm exec -w client -- tsc -b
npm run -w client test -- --maxWorkers=2
```

Two test workers avoid contention with other local tasks; the test selection and
assertions are unchanged. Do not reuse another checkout's `node_modules`.

The recommended TypeScript and React Hooks rules remain enabled for production
code and tests. Unused suppression comments are errors. Intentional unused
callback parameters use an underscore prefix; destructured rest siblings may be
omitted deliberately before forwarding DOM props or request options.

Exceptions are limited to the following boundaries:

- The exact Fast Refresh file list in `eslint.config.js` contains compound
  component namespaces, context/provider modules, and router/browser fixture
  entry points. These exports are intentional public APIs. Editing them may
  reload their consumers instead of preserving component state.
- Test-only partial component/context doubles, malformed payloads, and the
  synthetic HTTP/SSE transport have line-scoped `no-explicit-any` explanations.
  Other test code, including newly added tests, keeps the rule enabled.
- The query compatibility layer has two explicit heterogeneous boundaries:
  arbitrary Promise rejection payloads and mixed `useQueries` result types.
  Request bodies use `unknown`; domain responses and browser event handlers use
  concrete types.
- Selected effects initialize abortable request state, reconcile externally
  selected editable drafts, install media-query/clock subscriptions, or manage
  animation presence. Their line-scoped `set-state-in-effect` explanations
  preserve those lifecycle semantics. Pure derived selections, saved-baseline
  markers, and externally reset search/category state use guarded render-time
  updates instead.
- Context test probes intentionally expose rendered values to assertions. The
  active-project test deliberately inspects its public imperative ref. Those
  exceptions apply only at the observation lines.

Dependencies remain explicit. Request-generation cleanup deliberately increments
its live counter; DOM animation cleanup captures the mounted nodes. Query fetch
effects read the current cache on key/option changes without subscribing to their
own fetch-completion transitions, avoiding zero-stale-time refetch loops.

CI gate wiring remains separate work under GRAV-50.
