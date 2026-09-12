# Production readiness and recovery

## Runtime configuration

Use Node.js 20 LTS or newer and PostgreSQL 15 or newer. Production must set `NODE_ENV=production`, a single approved `CLIENT_URL`, a randomly generated JWT secret of at least 32 characters, and server-only database and Gemini credentials. Configure `TRUST_PROXY=true` only when the application is behind a trusted single reverse proxy. Set `DATABASE_SSL_MODE=require` when the provider requires encrypted PostgreSQL connections, or `verify-full` when its CA chain is available.

The PostgreSQL pool defaults to 10 connections, a 30-second idle timeout, and a 5-second connection timeout. These values can be changed through `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, and `DB_CONNECTION_TIMEOUT_MS` without changing source code. Do not raise the pool above the database provider's connection limit.

The application exposes `/health` for process liveness and `/ready` for database readiness. Neither endpoint exposes credentials or environment details. Requests receive an `X-Request-ID`; production request and error logs use structured JSON and exclude passwords, cookies, JWTs, CSV contents, and secrets.

## Migration safety

Run `npm run db:migrate` from `backend`. Migrations are ordered lexically by complete filename and recorded in `schema_migrations`; already applied filenames are never rerun. Existing duplicate numeric prefixes (`021`/`021a` and two `022` files) must not be renamed after deployment. Every migration runs in its own transaction and rolls back on failure.

Before a migration that changes or removes stored data, create and verify a PostgreSQL backup. Stop deployment if the backup cannot be validated. If a migration fails, retain the error output, confirm the transaction rolled back, correct the migration in a new migration file when the failed version may already have reached another environment, and rerun the command.

## Backup and restore

Create a logical backup with `pg_dump --format=custom --file=libro_backup.dump DATABASE_URL` using a protected administrative environment. Store the environment configuration separately in the deployment provider's secret manager; never place `.env` files in the database backup or repository.

Restore into an empty recovery database with `pg_restore --clean --if-exists --no-owner --dbname=RECOVERY_DATABASE_URL libro_backup.dump`. Point a non-production application instance to the restored database, run `npm run db:migrate`, and validate `/ready`, role/branch access, record counts, a sample COGS result, an inventory count, a report preview, and an export. Provider-managed backups must be enabled and tested in the provider console before they are described as automated.

## Graceful shutdown

On `SIGTERM` or `SIGINT`, the backend stops accepting new connections, waits for the HTTP server to close, closes the PostgreSQL pool, and exits. A 10-second safety timeout is configurable with `SHUTDOWN_TIMEOUT_MS`.
