import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { accessRouter } from "./routes/access.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { branchRouter } from "./routes/branch.routes.js";
import {
  inventoryItemRouter,
  menuCategoryRouter,
  menuItemRouter,
  recipeRouter,
} from "./routes/catalog.routes.js";
import { userRouter } from "./routes/user.routes.js";
import {
  inventoryMovementRouter,
  inventoryWorkflowRouter,
  notificationRouter,
  posSalesRouter,
  shrinkageReportRouter,
} from "./routes/inventoryWorkflow.routes.js";
import { accountRouter } from "./routes/account.routes.js";
import { messageRouter } from "./routes/message.routes.js";
import {
  incidentRouter,
  inventoryOverviewRouter,
  purchaseOrderRouter,
} from "./routes/operations.routes.js";
import { predictiveRouter } from "./routes/predictive.routes.js";
import { reportsRouter } from "./routes/reports.routes.js";
import { pool } from "./config/database.js";
import { requestContext } from "./middleware/requestContext.js";

export const app = express();
app.disable("x-powered-by");
if (env.TRUST_PROXY) app.set("trust proxy", 1);
app.use(requestContext);
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.get("/api/health", (_req, res) =>
  res.json({ success: true, data: { status: "ok" } }),
);
app.get("/health", (_req, res) => res.json({ status: "ok" }));
const readiness = async (_req: express.Request, res: express.Response) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ready", database: "available" });
  } catch {
    res.status(503).json({ status: "not_ready", database: "unavailable" });
  }
};
app.get("/ready", readiness);
app.get("/api/ready", readiness);
app.use("/api/auth", authRouter);
app.use("/api/access", accessRouter);
app.use("/api/branches", branchRouter);
app.use("/api/users", userRouter);
app.use("/api/inventory-items", inventoryItemRouter);
app.use("/api/menu-items", menuItemRouter);
app.use("/api/menu-categories", menuCategoryRouter);
app.use("/api/recipes", recipeRouter);
app.use("/api/pos-sales", posSalesRouter);
app.use("/api/inventory-counts", inventoryWorkflowRouter);
app.use("/api/inventory-movements", inventoryMovementRouter);
app.use("/api/shrinkage-reports", shrinkageReportRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/profile", accountRouter);
app.use("/api/messages", messageRouter);
app.use("/api/inventory-overview", inventoryOverviewRouter);
app.use("/api/incidents", incidentRouter);
app.use("/api/purchase-orders", purchaseOrderRouter);
app.use("/api/predictive-analytics", predictiveRouter);
app.use("/api/reports", reportsRouter);
app.use(notFoundHandler);
app.use(errorHandler);
