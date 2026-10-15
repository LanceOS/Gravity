# Creating and using the Docker image

Files used:

- [server/Dockerfile](../server/Dockerfile)
- [.github/workflows/docker-publish.yml](../.github/workflows/docker-publish.yml)
- [package.json](../package.json) (root — defines version and workspaces)

What changed

- The `server/Dockerfile` now builds the client and copies the built `client/dist` into the server image so the server serves the SPA.
- The GitHub Actions workflow now publishes the combined image as `ghcr.io/<owner>/gravity-app` and tags it with `latest`, the root package version, and the commit SHA.

Build locally (from repo root)

```bash
docker build -f server/Dockerfile -t yourname/gravity-app:latest .
```

Run locally with the [repository Compose setup](deployment-configuration.md#compose-secret-setup),
which provides PostgreSQL, Redis, and the required application secrets.

Use the repository root scripts to build instead of running subpackage scripts directly:

```bash
npm run build        # builds client and server via workspaces
```

CI / publishing

The workflow at [.github/workflows/docker-publish.yml](../.github/workflows/docker-publish.yml) builds from the repository root (so the `client/` folder is available to the `server/Dockerfile`) and publishes to GHCR as `gravity-app`. It reads the version from the root [package.json](../package.json) and applies a version tag.

Notes

- The server serves the client static files from `public/` in the image. Don't bake secrets into the image; pass them at runtime as environment variables or use your platform's secrets mechanism.
- To change the published image name or add Docker Hub support, update the workflow accordingly.
- Create the repository-root `.env` from `.env.example` and populate the required secrets. See [Compose secret setup](deployment-configuration.md#compose-secret-setup).

## Release builds and tags

The GitHub Actions workflow now also runs on GitHub Releases. When you publish a release (or push a git tag), the workflow detects the tag and sets `PACKAGE_VERSION` to the tag name. The image is then published with three tags:

- `ghcr.io/<owner>/gravity-app:latest`
- `ghcr.io/<owner>/gravity-app:${PACKAGE_VERSION}` (release tag or root package version)
- `ghcr.io/<owner>/gravity-app:${GITHUB_SHA}` (commit SHA)

Pull a specific release image:

```bash
docker pull ghcr.io/<owner>/gravity-app:v0.6.6
docker run -e PORT=8080 -p 8080:8080 ghcr.io/<owner>/gravity-app:v0.6.6
```

Triggering a release build

- Create a lightweight tag and push it: `git tag v0.6.6 && git push origin v0.6.6` — the workflow runs for the tag and the image will be tagged `v0.6.6`.
- Or create a Release in the GitHub UI for the desired tag.

Building from release artifacts (optional)

If you prefer building from a release artifact (for example if you attach a tarball to the Release), the workflow can be adapted to `curl` the asset, extract it, and use that directory as the build context. Let me know if you want that added.

Notes

- For reproducible deployment, pin the image to the version tag or the SHA rather than `latest`.
- Make sure GHCR package visibility and access permissions are configured if consumers should be able to pull the image.
