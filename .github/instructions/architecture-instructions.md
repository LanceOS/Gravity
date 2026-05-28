**Decentralized Multi-Tenant Workspace & AI-Powered Task Engine**

## 1. Executive Summary & Design Philosophy

Gravity is a self-hostable, centralized productivity application. Unlike traditional multi-tenant SaaS platforms, Gravity operates on a **Single-Host Workspace** paradigm:

* **The Workspace Boundary:** Each self-hosted instance (running on PostgreSQL) represents an isolated security and data boundary containing workspaces, projects, domains, cycles, and local accounts.
* **Centralized Identity:** Users access the workspace via the host's URL. Authentication and authorization are handled via session-based user actors within the host. Access to specific workspaces is granted through invitation links containing a unique invite code.
* **Strict Logic Decoupling:** Components and pages are strictly presentation layers. State orchestration and network actions are completely isolated within custom React hooks and utility layers.

## 2. Directory Structure (Clean, Modular Separation)

To prevent monolithic file bloat, the workspace utilizes a strict Page-and-Feature structure. All inline styles are abandoned for utility-first Tailwind classes, and logic is entirely decoupled from TSX markups.

```
gravity/
├── docker/                         # Compose files
│   ├── docker-compose.yml          # Base multi-container orchestration (App + Postgres)
│   ├── docker-compose.dev.yml      # Dev override for the Vite frontend container
│   ├── docker-compose.watch.yml    # Rebuild-on-change override for backend/frontend containers
├── client/
│   └── Dockerfile                  # Frontend image definition
└── server/
  └── Dockerfile                  # Backend image definition
├── package.json
├── src/
│   ├── main.tsx                    # System bootstrapping
│   ├── App.tsx                     # Top-level Routing Context ONLY (No logic)
│   ├── db/
│   │   ├── index.ts                # Drizzle Client connection
│   │   └── schema.ts               # PostgreSQL declarative schemas
│   ├── components/                 # Global Reusable Presentation UI (Pure Presenters)
│   │   ├── ui/
│   │   │   ├── CustomAlert.tsx     # Replaces browser .alert() window
│   │   │   ├── Button.tsx          # Custom semantic tokens (Contrast fixed)
│   │   │   └── LoadingSkeleton.tsx # Poppins-themed loading animations
│   │   └── layout/
│   │       ├── Sidebar.tsx         # Left navigation panel (Hidden in Settings)
│   │       └── WorkspaceDropdown.tsx # Selection control for switching servers
│   ├── context/                    # Shared Global State Providers
│   │   ├── ThemeContext.tsx        # Manages strict Poppins light/dark toggle
│   │   └── WorkspaceContext.tsx    # Manages active API endpoints & Auth states
│   ├── hooks/                      # Business Logic Only (No rendering, pure React hooks)
│   │   ├── useWorkspaceRegistry.ts # Manages user's local connection directory
│   │   ├── useAIConfig.ts          # Orchestrates model list fetching & test calls
│   │   ├── useProjectTasks.ts      # Atomic task states, domains, and comments
│   │   └── useWorkspaceSettings.ts # Saves settings dynamically to Postgres via REST
│   ├── pages/                      # Unique Environment Aggregators (No markup bloat)
│   │   ├── WorkspacesDashboard/    # Standalone screen for displaying joined workspaces
│   │   │   └── index.tsx
│   │   ├── WorkspaceView/          # Primary workspace views (Boards/Lists, Projects)
│   │   │   └── index.tsx
│   │   └── Settings/               # Fullscreen settings page (Replaces sidebar layout)
│   │       ├── index.tsx           # Page coordinator
│   │       ├── SettingsSidebar.tsx # Category menu selectors
│   │       └── CategoryPanel.tsx   # Panel layouts (Ollama, API Keys, General)
│   └── utils/
│       ├── api.ts                  # Axios client wrapper mapping dynamic Host URLs
│       └── crypto.ts               # Local secure key helpers
```

## 3. Database Schema Blueprint (PostgreSQL via Drizzle ORM)

This schema provides strong relational constraints, models multi-project scoping under workspaces, and handles standard user membership and invitation validation.

```
import { pgTable, uuid, text, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------
// Global Enums
// -------------------------------------------------------------------------
export const roleEnum = pgEnum('user_role', ['owner', 'admin', 'guest_contributor']);
export const themeEnum = pgEnum('theme_mode', ['light', 'dark']);
export const layoutEnum = pgEnum('view_layout', ['list', 'board']);
export const aiProviderEnum = pgEnum('ai_provider', ['openai', 'anthropic', 'gemini', 'deepseek', 'custom-mcp']);

// -------------------------------------------------------------------------
// Core Identity & Preferences
// -------------------------------------------------------------------------
export const workspaceUsers = pgTable('workspace_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  role: roleEnum('role').default('guest_contributor').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const workspaceSettings = pgTable('workspace_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => workspaceUsers.id, { onDelete: 'cascade' }).unique().notNull(),
  tutorialCompleted: boolean('tutorial_completed').default(false).notNull(),
  theme: themeEnum('theme').default('dark').notNull(),
  defaultView: layoutEnum('default_view').default('board').notNull(),
  ollamaEndpoint: text('ollama_endpoint').default('http://host.docker.internal:11434').notNull(),
  preferredOllamaModel: text('preferred_ollama_model'),
});

export const userAiCredentials = pgTable('user_ai_credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => workspaceUsers.id, { onDelete: 'cascade' }).notNull(),
  provider: aiProviderEnum('provider').notNull(),
  encryptedApiKey: text('encrypted_api_key').notNull(), // AES-256-GCM
  baseUrlOverride: text('base_url_override'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// -------------------------------------------------------------------------
// Workspace Membership & Invitations
// -------------------------------------------------------------------------
export const workspaceMembers = pgTable('workspace_members', {
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const workspaceInvites = pgTable('workspace_invites', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  code: text('code').notNull().unique(),
  createdBy: text('created_by').notNull(),
  expiresAt: timestamp('expires_at'),
  maxUses: integer('max_uses'),
  useCount: integer('use_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// -------------------------------------------------------------------------
// Projects (Multi-Project Workspace Context)
// -------------------------------------------------------------------------
export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const domains = pgTable('domains', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
});

export const cycles = pgTable('cycles', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'set null' }),
  cycleId: uuid('cycle_id').references(() => cycles.id, { onDelete: 'set null' }),
  assignedMemberId: uuid('assigned_member_id').references(() => workspaceUsers.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('todo').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const comments = pgTable('comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }).notNull(),
  authorId: uuid('author_id').references(() => workspaceUsers.id, { onDelete: 'cascade' }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

## 4. Single-Host Invitation & Joining Flow

When a user wants to access a workspace hosted on the server, they must be authenticated and use an invitation link to gain access:

### The Join Protocol

1. **Invite Generation:**
   * A workspace admin generates an invitation link which creates an entry in `workspace_invites`.
   * The invite contains a unique `code` parameter.
2. **Joining the Workspace:**
   * User navigates to the host URL with the invitation code (e.g., `https://host.com/join/CODE123`).
   * The client validates the code with the backend.
   * If the user is unauthenticated, they are prompted to log in or sign up on the host.
3. **Database Handshake (Join Fulfillment):**

   ```
   import { db } from './index';
   import { workspaceInvites, workspaceMembers } from './schema';
   import { eq, sql } from 'drizzle-orm';
   
   export async function processJoinWorkspace(userId: string, code: string) {
     return await db.transaction(async (tx) => {
       // Validate match
       const [invite] = await tx
         .select()
         .from(workspaceInvites)
         .where(eq(workspaceInvites.code, code));
   
       if (!invite) {
         throw new Error("Invalid or expired invitation.");
       }
   
       // Provision Membership
       await tx
         .insert(workspaceMembers)
         .values({
           workspaceId: invite.workspaceId,
           userId: userId,
           role: 'member',
         });
   
       // Update use count
       await tx
         .update(workspaceInvites)
         .set({ useCount: sql`${workspaceInvites.useCount} + 1` })
         .where(eq(workspaceInvites.id, invite.id));
   
       return { joined: true, workspaceId: invite.workspaceId };
     });
   }
   ```
4. **Connection Maintenance:**
   * The user logs in via standard session-based authentication (e.g., Better Auth).
   * Server validates access to resources by cross-referencing the user's ID with `workspaceMembers` mapping.

## 5. Polymorphic AI Integration Engine

### Dynamic Local Ollama Hook

To resolve connection crashes and hardcoding failures:


1. When navigating to settings or chat, the hook invokes `GET /api/ai/ollama/models`.
2. The server pings the local Ollama instance `/api/tags` utilizing `host.docker.internal` (safely resolving through container networks to the local OS ports).
3. If successful, it parses tags and assigns the first tag as the user's active setting.
4. If connection is refused, it catches the error and serves an empty collection `[]` cleanly, preventing UI crashes.

```
// src/hooks/useAIConfig.ts
import { useState, useEffect } from 'react';
import { api } from '@/utils/api';

export function useAIConfig() {
  const [models, setModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLocalOllamaModels = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<string[]>('/ai/ollama/models');
      setModels(response);
    } catch (err) {
      console.warn("Ollama local connection unavailable. Returning clean empty state.");
      setModels([]); // Clean failover
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async (provider: string, key: string) => {
    // Standard RPC connection tester
    return await api.post('/ai/test-connection', { provider, key });
  };

  return { models, isLoading, fetchLocalOllamaModels, testConnection };
}
```

## 6. Infrastructure Container Orchestration

The app is fully self-hostable with **Docker Compose**, with the backend depending explicitly on a verified healthy Postgres container.

```
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: gravity_postgres
    environment:
      POSTGRES_USER: gravity_user
      POSTGRES_PASSWORD: ${GRAVITY_POSTGRES_PASSWORD}
      POSTGRES_DB: gravity_workspace
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gravity_user -d gravity_workspace"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build: .
    container_name: gravity_app_server
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgresql://gravity_user:${GRAVITY_POSTGRES_PASSWORD}@postgres:5432/gravity_workspace
      - NODE_ENV=production
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
```

## 7. Clean-Slate Bootstrapping Policies

To maintain absolute data integrity at startup:

* **The Seeding Boundary:** Seed files containing dummy, demo, mock, or fake metrics must be strictly scoped to `process.env.NODE_ENV === 'development'`. When executing in production or on boot initialization, only foundational database layout statements (`db/migrations`) run. No raw rows can exist in the database upon fresh build boot.
* **Anonymous Accounts Prohibited:** Guest-account generation configurations on `better-auth` are hardcoded to `false`. Initial application startup immediately catches an unauthorized `401` profile check, routing the user cleanly to the custom Poppins registration or login portal.

## 8. Frontend Presentation Framework (Smart/Dumb Patterns)

All components follow a strictly functional structure:

* **The Presenter Rule:** Core components accept pure primitives (arrays, callback triggers, state properties). They are decoupled from custom network actions.
* **Flashing Elements Solved:** Changes (e.g., swapping layouts between Board/List or adding comments) trigger state changes at the parent Page level *only*. The children only re-render once.
* **Clean Contrast Systems:** Raw color allocations like `bg-black` are banned. Instead, Tailwind semantic colors coordinate UI states cleanly in Dark/Light themes without visual contrast issues:

```
// src/components/ui/Button.tsx
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

export const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', ...props }) => {
  return (
    <button
      className={`font-poppins px-4 py-2 rounded-md transition-all duration-200 active:scale-95 text-sm font-semibold
        ${variant === 'primary' 
          ? 'bg-primary-active text-white dark:bg-primary-dark dark:text-foreground-main hover:brightness-110' 
          : 'bg-secondary-card text-foreground-muted border border-border-muted dark:bg-card-dark dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800'
        }
      `}
      {...props}
    >
      {children}
    </button>
  );
};
```


