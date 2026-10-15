# Gravity client

## Development proxy and browser environment

The Vite development server proxies `/api` (with an optional slash or query)
and the OAuth discovery, authorize, token, register, and revoke endpoints to
`http://localhost:8080` by default. Set the **server-only** `BACKEND_UPSTREAM`
to change the target. Startup accepts `http://localhost:8080`,
`http://127.0.0.1:8080`, and `http://[::1]:8080` without extra configuration.
For another backend origin, list its exact HTTP(S) origin in the server-only
`GRAVITY_DEV_PROXY_ALLOWED_ORIGINS` variable:

```bash
BACKEND_UPSTREAM=http://backend:8080
GRAVITY_DEV_PROXY_ALLOWED_ORIGINS=http://backend:8080
npm run -w client dev
```

The root `docker-compose.dev.yml` override supplies the trusted
`http://backend:8080` origin for the Compose development stack. Vite reads
local `.env` files from `client/` regardless of the shell's current directory;
Compose reads the root `.env` for its own interpolation and passes configured
frontend environment values into the container.

The allowlist is comma-separated when several origins are needed. Proxy targets
and allowlist entries must be origins only: no credentials, paths, query strings,
or fragments. The Vite server fails at startup if the target is not allowed.
Only approve backends you control; proxied browser requests may contain session
cookies and authorization headers, which the app needs. The dev proxy removes
browser-supplied `Forwarded`, `X-Forwarded-*`, and `X-Real-IP` headers before
contacting the backend. Similar paths such as `/apiary` and `/authorize-extra`
stay in the SPA. `VITE_API_PROXY_TARGET` is rejected by both dev startup and client builds.
Use `BACKEND_UPSTREAM` instead.
The backend sees the Vite server's connection IP. Its IP-based rate limits and
IP-bound flows may therefore group multiple dev users together. Vite does not
establish a trustworthy client IP chain; use a configured ingress outside this
dev proxy when accurate client IPs matter.
This check applies to the Vite development server; the production nginx proxy
uses its own `BACKEND_UPSTREAM` setting.
Vite's build configuration has no dev proxy entry, and the production image
serves static assets with nginx rather than running Vite middleware.

Copy [client/.env.example](.env.example) to `client/.env` for local settings.
Every `VITE_` variable is available to browser code at build time. **Never put
secrets, tokens, passwords, or private backend URLs in a `VITE_` variable.**
Vite startup and builds reject `VITE_` names outside the four supported public
settings below; adding a new browser setting requires explicitly reviewing it.
The repository uses these variables. Storing a value in a CI secret does not
make it private after it is passed to a `VITE_` variable:

| Variable | Safe default or behavior when unset | Use |
| --- | --- | --- |
| `VITE_API_PROXY_TARGET` | Unset; a nonempty value fails Vite startup and builds | Legacy proxy target. Use server-only `BACKEND_UPSTREAM`. |
| `VITE_FRONTEND_PUBLIC_URL` | Unset; `GRAVITY_FRONTEND_PUBLIC_URL` is preferred | Optional public frontend URL used to allow the dev server host. Only use a public, browser-safe URL. |
| `VITE_ALLOWED_HOSTS` | Unset; Vite allows localhost and loopback, plus the configured public frontend host | Comma-separated additional dev server hostnames. List only hosts you control; do not use `*`. |
| `VITE_TICKET_URL_BASE` | `https://tickets.placeholder.local` | Optional ticket link base. Use a same-origin path or an HTTPS origin approved by `VITE_ALLOWED_TICKET_HOSTS`. |
| `VITE_ALLOWED_TICKET_HOSTS` | `tickets.placeholder.local` in the client; the main branch verification workflow requires a configured value | Comma-separated approved HTTPS ticket hosts; see [ticket URL guidance](../docs/client/TICKET_URL_BASE.md). |

The ticket-host workflow checks that a value exists; deployment builds must
also supply the intended public value to the client build environment.

## Local tests

Client Vitest suites support **Node >=22.22.2 <23**. The checked-in `.nvmrc`
selects the verified release. From the repository root:

```bash
cd client
nvm install
nvm use
npm ci --prefix ..
npm test
```

Use `npm run test:watch` for watch mode, `npm run test:e2e` for the mocked
end-to-end suites, or `npm test -- src/router/lazy-routes.test.tsx` for one suite.
With this Node version active, `npm run -w client test` also works from the root.
The Vitest configurations enforce the version for both scripts and direct Vitest
invocations. The normal suite includes the version guard and browser-global
regression tests; no additional test command is required.

Node 26 is currently unsupported for these tests: its native Web Storage globals
and stricter Request/AbortSignal checks conflict with Vitest 3's jsdom environment.
Do not use `NODE_OPTIONS=--no-experimental-webstorage` as a workaround; it does not
fix the navigation failure. No extra runtime flags or running services are needed
for the client unit tests. This restriction applies to the test harness and does
not change the application's browser support.

## Vite template notes

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
