This Docker Compose setup uses an internal network by default so services are not exposed to the host and avoid port conflicts.

Run internal-only (no host ports published):

```bash
docker compose -f docker/docker-compose.yml up -d
```

To publish the frontend to the host for browser access, add the optional override file:

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.host.yml up -d
```

The override publishes `${GRAVITY_FRONTEND_PORT}` (default `5173`) to the host. If you also need backend access from the host, create a similar override that adds a `ports` entry for the `backend` service.
