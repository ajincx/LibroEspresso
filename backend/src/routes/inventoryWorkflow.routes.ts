import { Router, raw } from "express";
import {
  createInventoryMovement,
  deletePosImport,
  getExpectedInventory,
  getPosAnalytics,
  getShrinkageReport,
  getShrinkageEvidence,
  importPosSales,
  listPosImports,
  listInventoryCounts,
  getInventoryCount,
  listInventoryVariances,
  listNotifications,
  markAllNotificationsRead,
  previewPosSales,
  requestPosImportApproval,
  listPosImportApprovals,
  reviewPosImportApproval,
  listShrinkageReports,
  markNotificationRead,
  reviewShrinkageReport,
  submitShrinkageInvestigation,
  submitInventoryCount,
  updateInventoryCount,
} from "../controllers/inventoryWorkflow.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createPosMapping, createPosSource, listPosMappings, listPosSources, updatePosMapping, updatePosSource } from "../controllers/posProductVariantMapping.controller.js";

export const posSalesRouter = Router();
posSalesRouter.use(authenticate, authorize("OWNER", "BRANCH_MANAGER"));
posSalesRouter.get("/analytics", asyncHandler(getPosAnalytics));
posSalesRouter.get("/sources", asyncHandler(listPosSources));
posSalesRouter.post("/sources", authorize("OWNER"), asyncHandler(createPosSource));
posSalesRouter.patch("/sources/:id", authorize("OWNER"), asyncHandler(updatePosSource));
posSalesRouter.get("/mappings", asyncHandler(listPosMappings));
posSalesRouter.post("/mappings", authorize("OWNER"), asyncHandler(createPosMapping));
posSalesRouter.patch("/mappings/:id", authorize("OWNER"), asyncHandler(updatePosMapping));
posSalesRouter.get("/", asyncHandler(listPosImports));
posSalesRouter.delete("/:id", authorize("OWNER"), asyncHandler(deletePosImport));
const posFileBody = raw({ type: "application/octet-stream", limit: "4mb" });
posSalesRouter.post("/preview", authorize("BRANCH_MANAGER"), posFileBody, asyncHandler(previewPosSales));
posSalesRouter.get("/approvals", asyncHandler(listPosImportApprovals));
posSalesRouter.post("/approvals", authorize("BRANCH_MANAGER"), posFileBody, asyncHandler(requestPosImportApproval));
posSalesRouter.patch("/approvals/:id", authorize("OWNER"), asyncHandler(reviewPosImportApproval));
posSalesRouter.post("/import", authorize("BRANCH_MANAGER"), posFileBody, asyncHandler(importPosSales));

export const inventoryWorkflowRouter = Router();
inventoryWorkflowRouter.use(authenticate, authorize("OWNER", "BRANCH_MANAGER"));
inventoryWorkflowRouter.get("/expected", asyncHandler(getExpectedInventory));
inventoryWorkflowRouter.get("/variances", asyncHandler(listInventoryVariances));
inventoryWorkflowRouter.get("/", asyncHandler(listInventoryCounts));
inventoryWorkflowRouter.get("/:id", asyncHandler(getInventoryCount));
inventoryWorkflowRouter.post("/", authorize("BRANCH_MANAGER"), asyncHandler(submitInventoryCount));
inventoryWorkflowRouter.patch("/:id", authorize("BRANCH_MANAGER"), asyncHandler(updateInventoryCount));

export const inventoryMovementRouter = Router();
inventoryMovementRouter.use(authenticate, authorize("OWNER", "BRANCH_MANAGER"));
inventoryMovementRouter.post("/", authorize("OWNER", "BRANCH_MANAGER"), asyncHandler(createInventoryMovement));

export const shrinkageReportRouter = Router();
shrinkageReportRouter.use(authenticate, authorize("OWNER", "BRANCH_MANAGER"));
shrinkageReportRouter.get("/", asyncHandler(listShrinkageReports));
shrinkageReportRouter.get("/:id", asyncHandler(getShrinkageReport));
shrinkageReportRouter.get("/:id/evidence", asyncHandler(getShrinkageEvidence));
shrinkageReportRouter.patch("/:id/investigation", authorize("BRANCH_MANAGER"), asyncHandler(submitShrinkageInvestigation));
shrinkageReportRouter.post("/:id/review", authorize("OWNER"), asyncHandler(reviewShrinkageReport));

export const notificationRouter = Router();
notificationRouter.use(authenticate);
notificationRouter.get("/", asyncHandler(listNotifications));
notificationRouter.patch("/read-all", asyncHandler(markAllNotificationsRead));
notificationRouter.patch("/:id/read", asyncHandler(markNotificationRead));
