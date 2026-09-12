import { app } from "./app.js";
import { pool, verifyDatabaseConnection } from "./config/database.js";
import { env } from "./config/env.js";

async function start() {
  await verifyDatabaseConnection();
  const server = app.listen(env.PORT, () => console.log(JSON.stringify({ timestamp: new Date().toISOString(), severity: "info", event: "SERVER_STARTED", port: env.PORT })));
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), severity: "info", event: "SERVER_SHUTDOWN_STARTED", signal }));
    const forced = setTimeout(() => {
      console.error(JSON.stringify({ timestamp: new Date().toISOString(), severity: "error", event: "SERVER_SHUTDOWN_TIMEOUT" }));
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);
    forced.unref();
    server.close(async (httpError) => {
      try { await pool.end(); } finally {
        clearTimeout(forced);
        if (httpError) console.error(JSON.stringify({ timestamp: new Date().toISOString(), severity: "error", event: "HTTP_SERVER_CLOSE_ERROR", message: httpError.message }));
        process.exit(httpError ? 1 : 0);
      }
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
start().catch((error) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    severity: "error",
    event: "SERVER_STARTUP_FAILED",
    errorCategory: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Server startup failed",
  }));
  process.exit(1);
});
