# Authentication & Authorization Architecture

Gravity implements a unified authentication layer powered by [Better-Auth](https://better-auth.com/), combined with a custom multi-tenant authorization (RBAC) model. This document outlines how authentication flows across the frontend and backend.

## 1. Backend Authentication

The backend serves as the source of truth for session management, interacting with PostgreSQL via Drizzle ORM.

### Configuration (`server/src/modules/auth/auth.ts`)
We initialize Better-Auth with:
- **Database Adapter**: Drizzle ORM (`pool`) pointing to our PostgreSQL cluster.
- **Session Lifetimes**: Standard 30-day expiration (`expiresIn: 60 * 60 * 24 * 30`) with rolling 24-hour update ages.
- **Email/Password**: Standard credentials provider is enabled.
- **Custom User Schema**: We extend the default user schema to include `tutorial_completed` using the `additionalFields` mapping, ensuring it hydrates into the session object.

### Database Schema (`server/src/modules/auth/schema.ts`)
Better-Auth automatically manages its required core tables:
- `authUsers` (`user`)
- `authSessions` (`session`)
- `authAccounts` (`account`)
- `authVerifications` (`verification`)

*Note: We intentionally do not use Better-Auth's `admin()` plugin to avoid polluting the global user table with system-wide roles, opting instead for custom multi-tenant roles.*

---

## 2. Frontend Authentication

The React frontend consumes the backend authentication state via a strongly typed Better-Auth client.

### Client Configuration (`client/src/context/auth/authClient.ts`)
The client is instantiated via `createAuthClient`. 
**Critical Detail:** The `baseURL` requires a fully-qualified absolute URL to prevent strict `new URL()` parsing crashes in the browser. The frontend dynamically resolves the origin using `window.location.origin` (or `localhost:3000` during testing).

### Session Hydration (`client/src/context/TicketContext.tsx`)
Authentication state is accessed reactively using the `authClient.useSession()` hook.
- It returns `data.session` and `isPending`, eliminating the need for a legacy custom `AuthContext` provider.
- Global user properties (like `id`, `name`, `email`, and `tutorial_completed`) are projected from the session data into the local `currentUser` state.

---

## 3. Security & Persistence

- **Session Storage**: We rely exclusively on Better-Auth's native HttpOnly cookies. We do **not** cache `gravity_user` credentials or session tokens in `localStorage`. This eliminates a major vector for Cross-Site Scripting (XSS) attacks.
- **Base URLs**: Strictly locked to environment origins and validated via standard URL parsing.

---

## 4. Authorization (RBAC)

Gravity is a multi-tenant application. Therefore, global roles (like "admin" or "user" on the main profile) are insufficient. Instead, authorization is handled **contextually**:

- **Workspace Roles (`workspace_members` table)**: Defines privileges across an entire workspace (e.g., billing, inviting users). Roles include `owner`, `admin`, `member`, and `guest_contributor`.
- **Project Roles (`project_members` table)**: Defines privileges for specific boards/projects (e.g., editing tasks). Roles include `developer` and `viewer`.

When a user interacts with a resource, the backend validates their permissions strictly against their membership record for that specific workspace or project tenant, completely bypassing global session roles.
