This Docker Compose setup attaches services to an internal network to avoid port conflicts.

The `frontend` service is published to the host by default so you can access the UI in your browser at `http://localhost:${GRAVITY_FRONTEND_PORT:-5173}`.

Start the stack:

```bash
docker compose -f docker/docker-compose.yml up -d
```

If you prefer to run fully internal-only (no host ports), remove or comment the `ports` entry under the `frontend` service in `docker/docker-compose.yml`.
