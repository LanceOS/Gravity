**A Technical Guide to Client-Side Routing, State Transitions, and User Experience Lifecycles**

## 1. Top-Level State Machine & Bootstrap Flow

When a user initializes the application, Gravity evaluates their local state to determine the starting environment. The application configuration state exists in one of several modes:

$$State_{\\text{Session}} \\in { \\text{Unauthenticated}, \\text{Onboarding}, \\text{WorkspaceSelector}, \\text{ActiveWorkspace} }$$

```
                   [ App Bootstrapped ]
                            │
                            ▼
              Is Active Session Token Saved?
               ├── No  ────────────────────────► [ Authentication Screen ]
               └── Yes                                   │
                    │                                    ▼
                    ▼                          Create Account / Sign In
         Fetch /api/me/config                            │
         (Get Global Preferences)                        │
                    │                                    │
                    ▼ ◄──────────────────────────────────┘
         Has Completed Onboarding?
               ├── No  ────────────────────────► [ Onboarding / Tutorial Modal ]
               └── Yes                                   │
                    │                                    ▼
                    ▼                            Sets `tutorial_completed = true`
         Select Active Workspace                         │
         (Reads registry from local DB)                  │
                    │                                    │
                    ▼ ◄──────────────────────────────────┘
         [ Hydrate Workspace Shell ]
```

### A. Lifecycle Checkpoints & Code Implementation Guide

* **The Zero-Data Gate (Unauthenticated State):**

  Upon start, the browser intercepts initial render lifecycles. If no valid authentication session is returned by the client wrapper, the layout displays a clean `/signup` or `/login` landing overlay. No dashboard or workspace markup is mounted.
* **Onboarding Verification State:**

  When `/api/me/config` returns a payload where `tutorial_completed` equals `false`, the client halts view hydration and displays a high-contrast modal requesting permission to start the workspace tutorial.
  * If accepted: Redirects to a step-by-step interactive walk-through highlighting projects, domains, cycles, and tasks.
  * If dismissed or completed: The app sends `PATCH /api/user/settings` with `{ tutorialCompleted: true }`, updates the context, and mounts the active workspace.

## 2. Interactive Workspace Flow (The Shared App Shell)

Once validated, the user is navigated to the primary Workspace layout. On desktop platforms, this view displays a multi-tier navigation scheme flowing from left to right.

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ [Workspace Dropdown]                                                              │
├──────────────────────┬────────────────────────────────────────────────────────────┤
│ (Sidebar Tree Navigation)                                                         │
│                      │ [View Toggle: (Board) / (List)]                            │
│ 📁 Gravity Core      ├────────────────────────────────────────────────────────────┤
│   ├─ 🗂️ Kanban Board │ [Sprint Cycle Active Header]                               │
│   ├─ 🗂️ List View    ├──────────────────────┬───────────────────────────────┬──────┤
│   ├─ ⚙️ Domains      │ Backlog              │ In Progress                   │ Done │
│   └─ 🔄 Cycles       ├──────────────────────┼───────────────────────────────┼──────┤
│                      │ • Task A             │ • Task B                      │      │
│ 📁 DeepSeek Module   │                      │                               │      │
│                      │                      │                               │      │
├──────────────────────┤                      │                               │      │
│ [Elena Rostova (Owner)]                     │                               │      │
└──────────────────────┴──────────────────────┴───────────────────────────────┴──────┘
```

### A. Sidebar Hierarchy Routing Rules

* Selecting **Project Tree Items** changes the parent scope dynamic context. It resets sub-navigation queries (`domains`, `cycles`, `views`) to target the selected project identifier only.
* Clicking the **Active Workspace Card** (avatar area at the bottom left) redirects the client router instantly to `/profile/:id` to access user settings and individual tasks.
* Clicking the **Quick Settings Cog** in the upper header unmounts the workspace navigation shell and displays the dedicated fullscreen Settings layout.

## 3. Dynamic Setting Portal Navigation Flow

When entering `/settings`, the global app navigation structure (containing projects, teams, and generic sidebars) is hidden. This ensures that the workspace administration panel feels like a distinct focused mode.

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ Workspace Settings                                                       [X Close]│
├──────────────────────┬────────────────────────────────────────────────────────────┤
│ Categories List      │ Active Preferences Configurator Panel                      │
│                      │                                                            │
│ • General            │ Ollama Configuration:                                      │
│ • AI Integrations    │ Local Host: [http://host.docker.internal:11434      ]      │
│                      │ Preferred Model: [ llama3.1 (Auto-Detected)          ▼ ]   │
│                      │                                                            │
│                      │ Key Management:                                            │
│                      │ Provider: [ DeepSeek   ▼ ]                                 │
│                      │ API Key:  [ **************************************** ]      │
│                      │                                                            │
│                      │ [ Test Integration Button ]                                │
│                      │ ⚠️ Testing connection will consume standard query tokens.   │
└──────────────────────┴────────────────────────────────────────────────────────────┘
```

### A. View Transitions inside the Settings UI


1. **Category Navigation:** Clicking items in the left-hand menu updates a reactive path variable (e.g., `/settings/general`, `/settings/ai`, `/settings/members`). The content container loads the selected settings form dynamically with hardware-accelerated animations.
2. **Polymorphic AI Config State Handlers:**
   * Selecting **Local Ollama** requests the models directory `GET /api/ai/ollama/models`. If successful, the input displays a list of available models. If it returns an empty array, the dropdown is disabled, and the input shows "No Local Models Found."
   * Selecting a cloud provider (e.g., DeepSeek, Gemini, Anthropic) displays a password-masked API Key input field and an interactive **"Test API Connection"** action button.
3. **Closing settings:** Clicking the close button (`X`) returns the routing path back to the last active project layout (e.g., `/projects/:id/views/board`), returning the global navigation elements to the screen.

## 4. Federated Remote Peer Handshake Flow

This flow handles situations where user $G$ (Guest) attempts to connect to an external workspace hosted on user $H$'s (Host) local machine. This exchange operates via REST protocols without a central database proxy.

```
Guest Client User (G)                                     Host Machine Server (H)
─────────────────────                                     ───────────────────────
          │                                                          │
          │ 1. Navigates to Invite URL                               │
          ├─────────────────────────────────────────────────────────►│
          │                                                          │
          │ 2. Request validation form criteria                      │
          │◄─────────────────────────────────────────────────────────┤
          │                                                          │
          │ 3. POST Guest Registration Credentials                   │
          │    - Username & password hash                            │
          │    - Email & Validation invite code                      │
          ├─────────────────────────────────────────────────────────►│
          │                                                          │
          │                                            Does [Email, Code, Link] Match
          │                                            active validation record?
          │                                            ├── No  ──► [Return 401]
          │                                            └── Yes ──► [Provision Guest Profile]
          │                                                          │
          │ 4. Return status, guest profile identity,                 │
          │    & Host Session Private Key                            │
          │◄─────────────────────────────────────────────────────────┤
          │                                                          │
          │ 5. Store key in local DB & swap Base URL                 │
          │    to host endpoint metadata                             │
          ▼                                                          ▼
```

### Guest Client Execution Loop

When a user switches to a workspace that is hosted on an external system:


1. The client-side client configures its network service with the target workspace’s endpoint:

   $$Base_URL \\leftarrow \\text{Target_Host_IP}$$
2. The client attaches the local secret key to the authorization header:

   `Authorization: Bearer <workspacePrivateKey>`
3. The guest client requests workspace files, project listings, and tasks. If the request fails or is rejected, the client switches back to their own local environment.

## 5. View Orchestration & Layout Locking Mechanics

To prevent content flickering when swapping between the **Kanban Board** and **List View**, the layout engine maintains a strict mounting lifecycle hook:

```
[ User Clicks Swap View Trigger ]
               │
               ├─► 1. Trigger database sync state mutator:
               │      `PATCH /projects/:id/view` -> updates `is_active = true`
               │
               ├─► 2. System activates "Layout Height Lock"
               │      (Calculates and applies exact pixel container heights)
               │
               ├─► 3. Component runs Exit Transitions (opacity 1 -> 0, transform scale 1 -> 0.98)
               │      Target animation timing: $T \le 150\text{ms}$
               │
               ├─► 4. Unmount old component -> Mount new component representation
               │
               ├─► 5. Component runs Entrance Transitions (opacity 0 -> 1, transform scale 0.98 -> 1)
               │      Target animation timing: $T \le 200\text{ms}$
               │
               └─► 6. Lift "Layout Height Lock" back to natural dynamic sizing
```

This layout locking process ensures that structural elements do not shift during render passes, providing a smooth transition as users navigate their workspaces.