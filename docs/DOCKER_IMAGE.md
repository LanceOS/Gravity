# Creating and using the Docker image

Files used:

- [server/Dockerfile](server/Dockerfile)
- [.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml)
- [package.json](package.json) (root — defines version and workspaces)

What changed

- The `server/Dockerfile` now builds the client and copies the built `client/dist` into the server image so the server serves the SPA.
- The GitHub Actions workflow now publishes the combined image as `ghcr.io/<owner>/gravity-app` and tags it with `latest`, the root package version, and the commit SHA.

Build locally (from repo root)

```bash
docker build -f server/Dockerfile -t yourname/gravity-app:latest .
```

Run locally

```bash
docker run -e PORT=8080 -p 8080:8080 yourname/gravity-app:latest
# then open http://localhost:8080 (client) and /api/v1 for API
```

Use the repository root scripts to build instead of running subpackage scripts directly:

```bash
npm run build        # builds client and server via workspaces
```

Example docker-compose (includes Postgres + Redis)

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: gravity
      POSTGRES_PASSWORD: example
      POSTGRES_DB: gravity
    volumes:
      - db-data:/var/lib/postgresql/data

  redis:
    image: redis:7
    volumes:
      - redis-data:/data

  app:
    image: ghcr.io/myorg/gravity-app:latest
    ports:
      - '8080:8080'
    environment:
      - NODE_ENV=production
      - PORT=8080
      - DATABASE_URL=postgres://gravity:example@postgres:5432/gravity
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

volumes:
  db-data:
  redis-data:
```

CI / publishing

The workflow at [.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml) builds from the repository root (so the `client/` folder is available to the `server/Dockerfile`) and publishes to GHCR as `gravity-app`. It reads the version from the root [package.json](package.json) and applies a version tag.

Notes

- The server serves the client static files from `public/` in the image. Don't bake secrets into the image; pass them at runtime as environment variables or use your platform's secrets mechanism.
- To change the published image name or add Docker Hub support, update the workflow accordingly.
