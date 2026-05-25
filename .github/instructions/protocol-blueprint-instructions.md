This blueprint defines the REST API surface and state transfer rules required to support centralized workspace management and invitation links.

## 1. REST Endpoint Specifications (Version 1)

All endpoints utilize the `/api/v1` namespace prefix. Requests containing writing or updating actions must return a payload structure mapped below.

### A. Invitations and Workspace Joining

#### 1. Generate Invite Link

* **Method:** `POST /api/v1/workspaces/:workspaceId/invites`
* **Authentication:** Requires `Owner` or `Admin` active session on the host.
* **Payload Shape:**

```
{
  "max_uses": 10,
  "expiration_hours": 24
}
```

* **Response Payload (201 Created):**

```
{
  "invite_url": "https://host-domain-or-ip.com/join/GRAV-9821-X",
  "code": "GRAV-9821-X",
  "expires_at": "2026-05-21T18:30:00Z"
}
```

#### 2. Process Join Request via Invite

* **Method:** `POST /api/v1/workspaces/invites/:inviteCode/join-requests`
* **Authentication:** Requires an active user session.
* **Payload Shape:**

```
{
  "code": "GRAV-9821-X"
}
```

* **Response Payload (200 OK):**

```
{
  "joined": true,
  "workspaceId": "wsp_1234567890",
  "role": "member"
}
```

## 2. Scoped Workspace Operations

Once a user joins a workspace, the server validates their access to workspace resources using standard session-based authentication cross-referenced with the `workspaceMembers` table.

### A. Querying Scoped Projects (Dynamic Workspace Hydration)

* **Method:** `GET /api/v1/projects`
* **Description:** Pulls all active projects, domains, and cycles assigned under this workspace in a single roundtrip to prevent visual flashing during client routing.
* **Response Payload (200 OK):**

```
[
  {
    "id": "9012c8a2-140b-419b-a012-70b12a838fac",
    "name": "Gravity Core Engine",
    "domains": [
      { "id": "d1", "name": "Frontend Architecture" },
      { "id": "d2", "name": "Core Sync Engine" }
    ],
    "cycles": [
      { "id": "c1", "name": "Cycle 01", "is_active": true }
    ]
  }
]
```

### B. Creating Comments (Fixing the UI Flashing Bug)

To prevent the client application from briefly flashing placeholder data, the comment endpoint must return the complete, server-sanitized object with the creator profile joined in one single payload.

* **Method:** `POST /api/v1/tasks/:taskId/comments`
* **Payload Shape:**

```
{
  "content": "Optimistic UI rendering test comment."
}
```

* **Response Payload (201 Created):**

```
{
  "id": "771a3e9c-102c-49f2-8c10-2f3b89012def",
  "task_id": "a9821c32-140b-419b-a012-70b12a838fac",
  "content": "Optimistic UI rendering test comment.",
  "created_at": "2026-05-20T20:30:00Z",
  "author": {
    "id": "e4b5d2c1-8f3a-4a2b-9c8d-7e6f5a4b3c2d",
    "username": "GuestExpert",
    "avatar_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb",
    "role": "guest_contributor"
  }
}
```

## 3. Polymorphic AI API Payload Routing

To handle local Ollama detection and fallbacks alongside secure cloud key configurations, the backend provides a singular wrapper API:

### A. Fetch Ollama Model List

* **Method:** `GET /api/v1/ai/ollama/models`
* **Logic:** The host engine pings the docker interface `http://host.docker.internal:11434/api/tags`.
* **Connection Error Return (Safe Failover):** If the server fails to connect to Ollama, it must return a clean `200 OK` status with an empty array to indicate no models are available, rather than throwing a `500 Server Error`.

```
[]
```

### B. Test Cloud Integration Connection

* **Method:** `POST /api/v1/ai/test-connection`
* **Payload Shape:**

```
{
  "provider": "deepseek",
  "api_key": "sk-ds-************************"
}
```

* **Execution Behavior:** Sends an immediate completion ping to the provider requesting exactly 1 max token.
* **Response Payload (200 OK):**

```
{
  "connected": true,
  "latency_ms": 142,
  "message": "Connection verified successfully."
}
```


