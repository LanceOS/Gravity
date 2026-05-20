The current federation protocol assumes that Guest $G$ can reliably route HTTP REST requests directly to Host $H$'s machine. In real-world networking, firewalls, dynamic IPs, and browser security policies will block these connections. This blueprint outlines the critical caveats of the current design and the required architectural changes to make remote workspace sharing bulletproof.

## 1. Network Reachability (The NAT & Dynamic IP Problem)

**The Caveat:**

Most users hosting a workspace will be behind a consumer router using NAT (Network Address Translation). If the host generates an invite link using their local IP (`http://192.168.1.55:8080`) or a dynamic public IP, the guest client will be completely unable to reach it across the internet without manual port forwarding. Furthermore, if the host's router reboots, their public IP changes, breaking the guest's saved connection.

**The Architectural Solution (Tunnels & Proxies):**

Gravity cannot rely on raw IPs. The self-hosted Docker stack must include an optional tunneling mechanism.

* **Implementation:** Bundle a lightweight reverse-tunnel daemon (like Cloudflare Tunnels `cloudflared`, Tailscale, or a custom Ngrok-style relay) within the Docker Compose file.
* **Result:** The host machine establishes an outbound tunnel to a proxy. The invite link generated is a stable, publicly routable URL (e.g., `https://gravity-workspace-abc.trycloudflare.com`) rather than a fragile IP address.

## 2. Browser CORS Policies (Cross-Origin Resource Sharing)

**The Caveat:**

If the Guest is running their Gravity frontend shell on `http://localhost:5173` (or a hosted domain like `https://app.gravity.com`) and attempts to make an Axios/Fetch `POST` request to the Host's machine at `https://remote-host.com/api/v1/workspaces/validate`, the browser will block the request entirely due to CORS policies.

**The Architectural Solution:**

The Gravity backend server must dynamically accept cross-origin requests from valid Gravity frontend shells, while explicitly allowing our custom cryptographic headers.

* **Implementation:** Update the Express/Fastify middleware on the backend to handle CORS preflight `OPTIONS` requests.
* **Required Header Allowlist:** The backend must explicitly expose and allow `X-Workspace-Key` and `Authorization`.

```
// Backend CORS Configuration
app.use(cors({
  origin: '*', // Or restricted to known Gravity app domains
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Key'],
}));
```

## 3. TLS / SSL Encryption (The Plaintext Vulnerability)

**The Caveat:**

Sending a `password_hash`, `email`, and receiving a `workspace_private_key` over standard `http://` leaves the credentials vulnerable to Man-in-the-Middle (MITM) attacks. Browsers will also block "mixed content" if a secure web app tries to connect to an insecure HTTP REST endpoint.

**The Architectural Solution:**

Connections to the host machine *must* be encrypted.

* **Implementation:** If using the tunnel approach mentioned in Caveat 1, TLS is handled automatically by the tunnel provider. If hosting directly via IP/DNS, the Docker Compose stack must include an automatic SSL proxy (like **Caddy** or **Traefik**) configured to provision Let's Encrypt certificates for the host.

## 4. Real-Time Collaboration (REST Polling Limitations)

**The Caveat:**

The current blueprint uses strictly REST (`GET`, `POST`, `PATCH`). If Guest A and Host B are looking at the same Kanban board, and Guest A moves a task to "Done," Host B will not see the change until they manually refresh the page or the app performs aggressive HTTP polling (which drains server resources and causes UI lag).

**The Architectural Solution:**

Gravity must introduce a **WebSocket (WS) or Server-Sent Events (SSE)** layer specifically for state hydration.

* **Implementation:** When a guest successfully authenticates via REST, the client downgrades to a persistent WebSocket connection: `wss://host-url/api/v1/sync?token=<workspacePrivateKey>`.
* **Event Driven:** When a `PATCH /tasks/:id` occurs, the server broadcasts an invalidation event to all connected clients in that workspace, prompting their React Query / SWR hooks to silently re-fetch the updated data in the background.

## 5. Host Downtime & Offline States

**The Caveat:**

Because the host machine holds the central database for the workspace, if the host closes their laptop or loses Wi-Fi, the guest's UI will instantly freeze or throw network errors.

**The Architectural Solution:**

The frontend architecture must gracefully degrade into a "Read-Only / Disconnected" state rather than crashing.

* **Implementation:** The global `useWorkspaceRegistry` hook must maintain a heartbeat ping (`GET /api/v1/health`).
* **UI Response:** If the ping fails, the UI mounts a "Host Unreachable" banner. All POST/PATCH buttons (like "Add Task" or "Save Settings") are temporarily disabled to prevent data loss or conflicting states when the host returns online.

## 6. Key Revocation & Security Lifecycles

**The Caveat:**

The current blueprint provisions a `workspacePrivateKey` for a guest, but lacks a defined workflow for what happens if the host wants to kick the guest out, or if the guest's machine is compromised.

**The Architectural Solution:**

The API must check the active status of the key on *every* protected request, not just during the handshake.

* **Implementation:** Add a `Revoke Access` button to the Host's UI in the Team Settings page. This executes a `PATCH` request setting `revoked = true` on the `workspace_keys` table.
* **Middleware Update:** The authentication middleware must cache key validations but immediately reject any request where `workspace_keys.revoked === true`, forcing the guest client to clear its local state and return to the Workspace Dashboard.


