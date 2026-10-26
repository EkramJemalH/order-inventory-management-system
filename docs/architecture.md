# Architecture & Folder Structure Overview

This project is organized as a **modular monorepo** using **pnpm workspaces**.

## Directory Breakdown

```text
order-inventory-management/
├── apps/
│   ├── web/                     # Frontend Application (Next.js, TypeScript, Plain CSS)
│   └── api/                     # Backend API (Elysia, Bun, TypeScript)
│       └── src/
│           ├── middleware/      # Cross-cutting HTTP middlewares (auth, logging, rate limiting)
│           ├── modules/         # Modular feature/domain logic (orders, inventory, products)
│           └── plugins/         # Elysia plugins, swagger/OpenAPI, CORS setup
├── packages/
│   ├── db/                      # Database package (Drizzle ORM, schema definitions, migrations)
│   │   └── src/
│   └── validation/              # Shared data schemas & contracts (Zod)
│       └── src/
├── docs/                        # Architecture, requirements, and design documentation
│   ├── architecture.md
│   ├── requirements.md
│   └── database-design.md
├── pnpm-workspace.yaml          # Monorepo workspace configuration
├── package.json                 # Root monorepo scripts & dependencies
└── .gitignore                   # Ignore rules for build artifacts and secrets
```

---

## Folder Responsibilities

### 1. `apps/web/`
- **Role:** Web client user interface.
- **Stack:** Next.js (App Router), TypeScript, plain CSS.
- **Responsibilities:**
  - Pages, UI layouts, interactive views.
  - Client-side data fetching and state management.
  - Communicating with the API server (`apps/api`).

### 2. `apps/api/`
- **Role:** High-performance REST/WebSocket backend server.
- **Stack:** Elysia.js runtime on Bun with TypeScript.
- **Subdirectories:**
  - `src/modules/`: Domain-driven feature slices (e.g., `orders`, `inventory`, `auth`). Each module contains its own controllers, services, and route definitions.
  - `src/plugins/`: Reusable server plugins (e.g., OpenAPI docs, Swagger, CORS, context injectors).
  - `src/middleware/`: Global request/response guards, session handlers, error formatters.

### 3. `packages/db/`
- **Role:** Single source of truth for database schema and connections.
- **Stack:** Drizzle ORM + PostgreSQL.
- **Responsibilities:**
  - Database schema definitions and relationships.
  - Migration scripts and seed data.
  - Shared typed database client for server modules.

### 4. `packages/validation/`
- **Role:** Shared contracts and input/output validation.
- **Stack:** Zod.
- **Responsibilities:**
  - End-to-end type safety between backend and frontend.
  - Request body schemas, URL query schemas, and API response contracts.

### 5. `docs/`
- **Role:** System documentation, requirements tracking, and architectural decision records (ADRs).
