import { app } from "./app.js";
import { verifyDatabaseConnection } from "./config/database.js";
import { env } from "./config/env.js";

async function start() {
  await verifyDatabaseConnection();
  app.listen(env.PORT, () => console.log(`Libro API listening on http://localhost:${env.PORT}`));
}
start().catch((error) => { console.error("Server startup failed", error); process.exit(1); });
