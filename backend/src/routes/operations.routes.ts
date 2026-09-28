import { Router } from "express";
import {
  createIncidentReport,
  createPurchaseOrder,
  authorizePurchaseOrderTestCleanup,
  deletePurchaseOrderTestData,
  getInventoryOverview,
  getPurchaseOrder,
  listIncidentItemOptions,
  listIncidentReports,
  listPurchaseOrders,
  linkIncidentToInvestigation,
  receivePurchaseOrder,
  reviewIncidentReport,
  updateBranchInventorySettings,
  updatePurchaseOrderStatus,
} from "../controllers/operations.controller.js";
import { applyPurchaseOrderLifecycle, archiveIncidentReport } from "../controllers/controlledDestructive.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const inventoryOverviewRouter = Router();
inventoryOverviewRouter.use(authenticate);
inventoryOverviewRouter.get(
  "/",
  authorize("OWNER", "BRANCH_MANAGER"),
  asyncHandler(getInventoryOverview),
);
inventoryOverviewRouter.patch(
  "/:inventoryItemId/settings",
  authorize("BRANCH_MANAGER"),
  asyncHandler(updateBranchInventorySettings),
);

export const incidentRouter = Router();
incidentRouter.use(authenticate);
incidentRouter.get("/", asyncHandler(listIncidentReports));
incidentRouter.get(
  "/options",
  authorize("STAFF", "BRANCH_MANAGER"),
  asyncHandler(listIncidentItemOptions),
);
incidentRouter.post(
  "/",
  authorize("STAFF", "BRANCH_MANAGER"),
  asyncHandler(createIncidentReport),
);
incidentRouter.patch(
  "/:id/link",
  authorize("BRANCH_MANAGER"),
  asyncHandler(linkIncidentToInvestigation),
);
incidentRouter.post("/:id/lifecycle", asyncHandler(archiveIncidentReport));
incidentRouter.patch(
  "/:id/review",
  authorize("BRANCH_MANAGER"),
  asyncHandler(reviewIncidentReport),
);

export const purchaseOrderRouter = Router();
purchaseOrderRouter.use(authenticate);
purchaseOrderRouter.get(
  "/",
  authorize("OWNER", "BRANCH_MANAGER"),
  asyncHandler(listPurchaseOrders),
);
purchaseOrderRouter.post(
  "/",
  authorize("BRANCH_MANAGER"),
  asyncHandler(createPurchaseOrder),
);
purchaseOrderRouter.post(
  "/:id/lifecycle",
  authorize("OWNER", "BRANCH_MANAGER"),
  asyncHandler(applyPurchaseOrderLifecycle),
);
purchaseOrderRouter.get(
  "/:id",
  authorize("OWNER", "BRANCH_MANAGER"),
  asyncHandler(getPurchaseOrder),
);
purchaseOrderRouter.patch(
  "/:id/status",
  authorize("BRANCH_MANAGER"),
  asyncHandler(updatePurchaseOrderStatus),
);
purchaseOrderRouter.post(
  "/:id/receive",
  authorize("BRANCH_MANAGER"),
  asyncHandler(receivePurchaseOrder),
);
purchaseOrderRouter.post(
  "/:id/authorize-test-cleanup",
  authorize("OWNER"),
  asyncHandler(authorizePurchaseOrderTestCleanup),
);
purchaseOrderRouter.delete(
  "/:id",
  authorize("OWNER"),
  asyncHandler(deletePurchaseOrderTestData),
);
