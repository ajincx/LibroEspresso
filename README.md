# Libro Espresso COGS & Inventory Intelligence

Libro Espresso is a full-stack inventory, COGS, sales, recipe, and shrinkage monitoring system for Libro Espresso Cafe. It supports Owner and Branch Manager roles, branch-scoped access, PostgreSQL persistence, and a responsive light/dark interface.

## Technology stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS 4, React Router, Axios, Radix UI, Material UI, Lucide React, and Recharts
- Backend: Node.js 20+, Express 5, TypeScript, Zod, bcrypt, JWT HTTP-only cookies, Helmet, CORS, and rate limiting
- Database: PostgreSQL 15+
- Testing: Vitest and Supertest

## Project structure

```text
LibroEspresso/
|-- frontend/       React and Vite application
|-- backend/        Express API and database tooling
|   |-- migrations/ Ordered PostgreSQL migrations
|   `-- src/
|-- .gitignore
`-- README.md
```

The frontend and backend are separate applications and must run in separate terminals.

## Prerequisites

Install Git, Node.js 20 or newer, PostgreSQL 15 or newer, and preferably pgAdmin 4 and Visual Studio Code.

Verify the required command-line tools in CMD:

```cmd
git --version
node --version
npm --version
psql --version
```

## First-time installation

### 1. Clone the repository

```cmd
git clone https://github.com/ajincx/LibroEspresso.git
cd LibroEspresso
```

For a private repository, the owner must add each group member as a collaborator. The member must accept the GitHub invitation before cloning. Using Git is recommended over downloading a ZIP because future updates can be pulled easily.

### 2. Create the PostgreSQL database

In pgAdmin, connect to the local PostgreSQL server and create a database named `libro_cogs`.

Alternatively, use CMD:

```cmd
psql -U postgres -h localhost -p 5432 -d postgres
```

Then run:

```sql
CREATE DATABASE libro_cogs;
```

Exit with `\q`. Skip this command if the database already exists.

### 3. Create environment files

From the `LibroEspresso` directory:

```cmd
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
```

Generate a secure JWT secret:

```cmd
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Configure `backend/.env`:

```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/libro_cogs
CLIENT_URL=http://localhost:5173
JWT_SECRET=PASTE_THE_GENERATED_SECRET_HERE
JWT_EXPIRES_IN=8h
COOKIE_NAME=libro_session
GEMINI_API_KEY=
SEED_OWNER_PASSWORD=LibroOwner2026!
SEED_MANAGER_PASSWORD=LibroManager2026!
```

Replace `YOUR_POSTGRES_PASSWORD` with the password for that laptop's local `postgres` user. Each group member can use a different PostgreSQL password. Reserved URL characters such as `@`, `:`, `/`, `?`, or `#` must be URL-encoded in `DATABASE_URL`.

Configure `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

Never commit or share real `.env` files. Only the `.env.example` files belong in Git.

### 4. Install and initialize the backend

```cmd
cd backend
npm ci
npm run db:migrate
npm run db:seed
```

The migrations create the database tables. The seed creates development branches, users, inventory definitions, menu products, and standard recipes.

### 5. Install the frontend

```cmd
cd ..\frontend
npm ci
```

## Running the application

### Terminal 1 - Backend

```cmd
cd path\to\LibroEspresso\backend
npm run dev
```

Health check: [http://localhost:5000/api/health](http://localhost:5000/api/health)

### Terminal 2 - Frontend

```cmd
cd path\to\LibroEspresso\frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Development accounts

Run `npm run db:seed` before using these accounts.

Owner:

```text
Email: owner@libro.com
Password: owner123
Role: OWNER
```

Branch Managers (password for all Manager accounts: `manager123`):

```text
Gulod:    manager.gulod@libro.com
Lipa:     manager@libro.com
Tagaytay: manager.tagaytay@libro.com
Vermosa:  manager.vermosa@libro.com
Evo:      manager.evo@libro.com
```

These accounts are for local development only. Passwords are bcrypt-hashed in PostgreSQL and are not prefilled by the frontend.

## Connected workflow

```text
Inventory Items
  -> Menu Products and Standard Recipes
  -> POS Sales Import
  -> Expected Ingredient Usage and Inventory
  -> Physical Inventory Count
  -> Variance and Shrinkage Detection
  -> Manager Shrinkage Report
  -> Owner Review and Notifications
```

Owner access is company-wide. Branch Manager access is restricted to the authenticated manager's assigned branch.

## Commands and verification

Frontend commands:

```cmd
cd frontend
npm run dev
npm run typecheck
npm run build
```

Backend commands:

```cmd
cd backend
npm run dev
npm run typecheck
npm run build
npm test
npm run db:migrate
npm run db:seed
```

Before submitting changes, run both typechecks and builds plus the backend tests.

## Getting future updates

```cmd
cd path\to\LibroEspresso
git pull origin main
```

If dependencies or migrations changed, run:

```cmd
cd backend
npm ci
npm run db:migrate

cd ..\frontend
npm ci
```

`npm run db:seed` is mainly for first-time setup. Do not run it routinely unless development fixtures need to be restored or updated.

## Group contribution workflow

Create a separate branch for each task:

```cmd
git checkout main
git pull origin main
git checkout -b feature/short-task-name
```

After making and testing changes:

```cmd
git status
git add .
git commit -m "Describe the completed change"
git push -u origin feature/short-task-name
```

Open a Pull Request on GitHub and ask another group member to review it before merging.

Do not commit `.env` files, database passwords, JWT secrets, `node_modules`, `dist`, or logs.

## Common setup problems

### PostgreSQL password authentication failed

Confirm the password in `backend/.env` matches the local PostgreSQL `postgres` account.

### Database does not exist

Create `libro_cogs`, then run `npm run db:migrate` inside `backend`.

### Backend cannot connect

Confirm PostgreSQL is running and check the database name, password, host, and port in `DATABASE_URL`.

### Frontend cannot reach the backend

Confirm the backend is running on port `5000`, the frontend is on port `5173`, and both environment URLs match those ports.

### Port already in use

Close the application using port `5000` or `5173`, then restart the corresponding development server.
