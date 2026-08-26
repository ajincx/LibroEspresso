
# Libro Espresso COGS & Inventory Intelligence

Phase 1 full-stack foundation for Libro Espresso Cafe's multi-branch inventory, COGS, and shrinkage system. The original Figma Make visual design is preserved while authentication, URL routing, RBAC, branch scoping, and PostgreSQL persistence are added underneath it.

## Tech stack and prerequisites

React 18, Vite, TypeScript, React Router, Axios, Tailwind CSS 4, Radix/shadcn, Lucide, Recharts, Node.js 20+, Express 5, PostgreSQL 15+, bcrypt, JWT HTTP-only cookies, Zod, Helmet, CORS, and rate limiting.

## Environment and PostgreSQL setup

Copy `backend/.env.example` to `backend/.env`, replace `JWT_SECRET` with at least 32 random characters, and configure `DATABASE_URL`. Then create and initialize the database:

```sql
CREATE DATABASE libro_cogs;
```

```bash
cd backend
npm install
npm run db:migrate
npm run db:seed
```

The ordered migration runner creates `branches`, `users`, `audit_logs`, `inventory_items`, `menu_items`, `recipes`, and `recipe_items` with constraints and indexes. Applied filenames are tracked in `schema_migrations`; each new migration runs transactionally. The development seed is also transactional and includes an Iced Spanish Latte recipe fixture.

## Run backend

```bash
cd backend
npm run dev
```

Health check: `GET http://localhost:5000/api/health`.

## Run frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The default API URL is `http://localhost:5000/api`.

## Development accounts

- Owner: `owner@libro.com` / `owner123`
- Lipa Branch Manager: `manager@libro.com` / `manager123`

These are local seed credentials only. Override them with `SEED_OWNER_PASSWORD` and `SEED_MANAGER_PASSWORD` before seeding.

## API architecture

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/health`
- `GET /api/access/owner-check` (RBAC verification)
- `GET /api/access/branch-scope` (branch-scoping verification)
- `GET|POST /api/branches`, `GET|PATCH /api/branches/:id`
- `GET|POST /api/users`, `GET|PATCH /api/users/:id`, `PATCH /api/users/:id/status`
- `GET|POST /api/inventory-items`, `GET|PATCH /api/inventory-items/:id`
- `GET|POST /api/menu-items`, `GET|PATCH /api/menu-items/:id`
- `GET|POST /api/recipes`, `GET|PUT /api/recipes/:id`

Responses use `{ success, data }` or `{ success, error }`. Authentication uses signed JWTs in HTTP-only SameSite cookies. Branch Managers resolve their effective branch exclusively from the authenticated identity. Owner routes use centralized authorization middleware.

## Folder structure and RBAC

- `frontend/src/app/App.tsx`: preserved Figma screens and visual components
- `frontend/src/app/contexts`, `routes`, `services`, `types`: frontend architecture
- `backend/src/config`, `controllers`, `routes`, `services`: REST architecture
- `backend/src/middleware`: authentication, authorization, scoping, errors
- `backend/migrations`, `backend/src/database`: PostgreSQL schema and tooling

`OWNER` can use every Phase 1 route. `BRANCH_MANAGER` cannot open `/users` or `/branches`; direct URL attempts redirect to `/dashboard`, while backend Owner endpoints return `403`.

The Owner also has `/inventory/master-data` for database-backed inventory definitions, menu products, and standardized recipes. Managers may read catalog definitions needed by operational screens but cannot mutate global definitions.

## Verification

```bash
cd frontend
npm run typecheck
npm run build
cd ..\backend
npm run typecheck
npm run build
npm test
```

The dashboard business figures remain Figma mock data until their Phase 2 APIs exist. Phase 1 authentication and authorization are real and database-backed.
  
