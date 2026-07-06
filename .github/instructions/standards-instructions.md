This document defines the absolute directory layout, file naming conventions, and software engineering standards for both frontend and backend domains of Gravity. Adherence to this specification prevents monolithic bloat, minimizes merge conflicts, and guarantees high testability.

## 1. Directory Structure Specifications

```
gravity/
├── .github/                      # CI/CD pipelines, linting actions, and PR templates
├── docker/                       # Compose files for local/dev deployments
│   ├── docker-compose.yml        # Base multi-container orchestration (frontend + backend + postgres)
│   ├── docker-compose.dev.yml    # Vite/HMR overrides for local frontend development
├── client/
│   └── Dockerfile                # Production nginx frontend image
└── server/
  └── Dockerfile                # Production API image
├── backend/                      # Node.js + Express/Fastify Core Service
│   ├── src/
│   │   ├── config/               # Environment variables and dynamic database pools
│   │   ├── db/                   # Database schemas and Drizzle migrator configs
│   │   │   ├── index.ts          # Postgres pool instantiation
│   │   │   └── schema.ts         # Relational Drizzle table mappings
│   │   ├── middleware/           # Auth, logging, and dynamic tenant routing rules
│   │   ├── routes/               # API Router modules (Versioned: v1)
│   │   ├── services/             # Dynamic business logic engines (AI providers, Handshakes)
│   │   ├── utils/                # Cryptographic helpers and validation utilities
│   │   └── index.ts              # Server bootstrapper
│   ├── tests/                    # Integration, unit, and mock connection suites
│   └── package.json
├── frontend/                     # React + Tailwind + Vite Web Shell
│   ├── src/
│   │   ├── assets/               # Static global branding images and loaders
│   │   ├── components/           # Pure UI (Presentational / "Dumb" Components)
│   │   │   ├── ui/               # Atomic elements (Buttons, Inputs, Modals)
│   │   │   ├── layout/           # Regional structural items (Sidebar, Top Bar, Drawers)
│   │   │   └── presenters/       # Complex state-free layouts (TaskBoard, WorkspaceGrid)
│   │   ├── context/              # Global state providers (Theme, Connection State)
│   │   ├── hooks/                # Business logic hooks only (API handlers, events)
│   │   ├── pages/                # Route aggregators (Settings, Workspace, Dashboard)
│   │   ├── router/               # Dynamic client-side routes (Bypassing sidebars on Settings)
│   │   ├── utils/                # HTTP Client configurations and P2P connection caches
│   │   ├── App.tsx               # Minimal root wrapper (Providers and Routes only)
│   │   └── main.tsx              # System entry point
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── package.json
└── README.md
```

## 2. Naming & Case Conventions

To prevent file-resolution issues on case-sensitive Unix/Linux systems (frequent in Docker deployments), developers must follow these casing protocols:

* **Files & Folders (General):** All non-component directories and utilities must use lower kebab-case (e.g., `user-settings/`, `api-client.ts`).
* **React Components & Pages:** Files containing JSX/TSX layout elements must use PascalCase (e.g., `CustomAlert.tsx`, `Sidebar.tsx`).
* **Database Tables & Fields:** Drizzle ORM schemas must map to snake_case names (e.g., `workspace_users`, `encrypted_api_key`) to follow SQL standards.

## 3. Core Software Engineering Policies

### A. The Pure Presenter Principle

React components placed inside `components/` are banned from performing any side effects, fetch requests, or dispatching direct mutations. They must operate strictly as pure functional mappers:

$$\\text{UI} = f(\\text{Props})$$

* *Anti-pattern:* Mapping a `useEffect` inside a card component to fetch task details.
* *Correct practice:* The card receives task details and an `onTaskUpdate` callback function from its parent page, which coordinates the state modification via a custom hook.

### B. The Custom Hook Encapsulation Rule

All fetch queries, local storage actions, and dynamic window listeners (such as the Outside-Click Popover Dismissal mechanism) must be wrapped inside custom hooks:

* Hooks must manage their own loading, error, and cached states.
* Any state changes triggered inside a hook must return a stable, memoized callback array or object to avoid layout re-render loops in pure presenters.

### C. Zero Inline Styles Policy

All component styling must use Tailwind utility classes. For recurring UI elements, do not use `@apply` blocks inside global stylesheets. Instead, use atomic design tokens exported as JavaScript constants:

```
// src/components/ui/Button.tsx
export const BUTTON_VARIANTS = {
  primary: "bg-indigo-600 text-white dark:bg-indigo-500 dark:text-neutral-950 hover:bg-indigo-700",
  secondary: "bg-white text-neutral-800 border border-neutral-200 dark:bg-neutral-900 dark:text-neutral-200"
};
```

