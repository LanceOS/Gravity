# Gravity — Development notes

Quick instructions for running the app in development with a live-reloading frontend.

## Dev (compose with Vite HMR)

Podman (recommended):

```bash
podman compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d
```

Docker (replace `podman` with `docker`):

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d
```

This starts the backend and a containerized Vite dev server for the frontend (HMR).
The dev frontend is reachable on host port `33101` by default.

To stop the dev stack:

```bash
podman compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml down
```

## Watch the nginx frontend on 33100

If you want to keep the production-style frontend container on host port `33100`
up to date without manually rerunning `up --build`, use the Docker watch override:

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.watch.yml up -d
docker compose -f docker/docker-compose.yml -f docker/docker-compose.watch.yml watch
```

Run `watch` in a second terminal and leave it attached. It rebuilds the backend
and frontend images whenever files under `server/`, `client/`, or `library/` change.

## Standalone dev container (what I used)

If you prefer running only the frontend dev server in a container (maps host `node_modules` and preserves UID):

```bash
cd "$(pwd)"
podman rm -f gravity_frontend_dev_run || true
podman run -d --rm --userns=keep-id --name gravity_frontend_dev_run \
  -p 33101:5173 \
  -v "$(pwd)/client":/app/client:Z \
  -v "$(pwd)/library":/app/library:Z \
  -v "$(pwd)/client/node_modules":/app/client/node_modules:Z \
  -w /app/client node:20-slim \
  sh -c "npm run dev -- --host 0.0.0.0 --port 5173"
```

Notes:
- Docker files now live under `docker/`, with `docker/frontend.Dockerfile` serving the nginx frontend and `docker/backend.Dockerfile` building the API container.
- If you want that nginx container on `33100` to rebuild automatically on frontend changes,
  use `docker/docker-compose.watch.yml` with `docker compose watch`.
- If you change frontend source and want the production nginx container to serve changes, rebuild the image with:

```bash
podman compose -f docker/docker-compose.yml up -d --build frontend
```

- On some systems you may need to adapt the volume flags (`:Z`, `:z`) or file ownership to allow the container to read mounted files.
