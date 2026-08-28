import { Router } from "express";
import {
  createInventoryMovement,
  getExpectedInventory,
  getShrinkageReport,
  importPosSales,
  listInventoryCounts,
  listInventoryVariances,
  listNotifications,
  listShrinkageReports,
  markNotificationRead,
  reviewShrinkageReport,
  submitShrinkageInvestigation,
  submitInventoryCount,
} from "../controllers/inventoryWorkflow.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const posSalesRouter = Router();
posSalesRouter.use(authenticate);
posSalesRouter.post("/import", authorize("BRANCH_MANAGER"), asyncHandler(importPosSales));

export const inventoryWorkflowRouter = Router();
inventoryWorkflowRouter.use(authenticate);
inventoryWorkflowRouter.get("/expected", asyncHandler(getExpectedInventory));
inventoryWorkflowRouter.get("/variances", asyncHandler(listInventoryVariances));
inventoryWorkflowRouter.get("/", asyncHandler(listInventoryCounts));
inventoryWorkflowRouter.post("/", authorize("BRANCH_MANAGER"), asyncHandler(submitInventoryCount));

export const inventoryMovementRouter = Router();
inventoryMovementRouter.use(authenticate);
inventoryMovementRouter.post("/", authorize("OWNER", "BRANCH_MANAGER"), asyncHandler(createInventoryMovement));

export const shrinkageReportRouter = Router();
shrinkageReportRouter.use(authenticate);
shrinkageReportRouter.get("/", asyncHandler(listShrinkageReports));
shrinkageReportRouter.get("/:id", asyncHandler(getShrinkageReport));
shrinkageReportRouter.patch("/:id/investigation", authorize("BRANCH_MANAGER"), asyncHandler(submitShrinkageInvestigation));
shrinkageReportRouter.post("/:id/review", authorize("OWNER"), asyncHandler(reviewShrinkageReport));

export const notificationRouter = Router();
notificationRouter.use(authenticate);
notificationRouter.get("/", asyncHandler(listNotifications));
notificationRouter.patch("/:id/read", asyncHandler(markNotificationRead));
