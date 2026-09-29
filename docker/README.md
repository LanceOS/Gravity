This Docker Compose setup attaches services to an internal network to avoid port conflicts.

The `frontend` service is published to the host by default so you can access the UI in your browser at `http://localhost:${GRAVITY_FRONTEND_PORT:-5173}`.

Start the stack:

```bash
docker compose -f docker/docker-compose.yml up -d
```

If you prefer to run fully internal-only (no host ports), remove or comment the `ports` entry under the `frontend` service in `docker/docker-compose.yml`.

### Locked image builds and publication

The repository-root `package-lock.json` is authoritative for **both** npm
workspaces (`client` and `server`). Image stages copy the root manifest, lock,
and both workspace manifests before `npm ci`. Update dependencies from the
repository root and commit the root lockfile with manifest changes. The legacy
`server/package-lock.json` is not used by workspace/image installs; do not use it
to update release dependencies. No image stage falls back to `npm install`.
The production server keeps `/app/server` as its working directory and retains
npm's workspace dependency layout under `/app`.

Image builds use Node 22 (Vite 8 requires a recent Node runtime). Both release
Dockerfiles run the normal build scripts, including TypeScript checks. A lock
mismatch, type error, or Vite error fails the image build without placeholder
artifacts.

The publish workflow builds and loads amd64 and arm64 images on disposable CI
runners, starts the real server entrypoint against disposable PostgreSQL/Redis,
and checks readiness plus HTML and referenced JavaScript/CSS from both server
and nginx images. QEMU exercises arm64 on the hosted runner. Only after **both**
architectures pass does the publish job load and publish the exact tested server
image archives and assemble the release manifest; it does not rebuild them.
The nginx image is tested but is not published by this workflow.

The smoke checker can be unit-tested without containers or services:
`node --test scripts/docker/smoke-image.test.mjs`. Running the publish workflow
itself requires container lifecycle operations on its disposable CI runner.
