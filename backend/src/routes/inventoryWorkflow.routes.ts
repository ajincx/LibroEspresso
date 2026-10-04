import { Router, raw } from "express";
import {
  createInventoryMovement,
  authorizePosImportCleanup,
  deletePosImport,
  getExpectedInventory,
  getPosAnalytics,
  getShrinkageReport,
  getShrinkageEvidence,
  importPosSales,
  listPosImports,
  listInventoryCounts,
  getInventoryCount,
  listUatInventoryCounts,
  getUatInventoryCount,
  listInventoryVariances,
  listNotifications,
  markAllNotificationsRead,
  previewPosSales,
  listShrinkageReports,
  markNotificationRead,
  reviewShrinkageReport,
  submitShrinkageInvestigation,
  submitInventoryCount,
  updateInventoryCount,
  classifyInventoryCountAsTestData,
} from "../controllers/inventoryWorkflow.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { archiveShrinkageReport, deletePosSourceConfiguration, voidVarianceRecord } from "../controllers/controlledDestructive.controller.js";
import { copyApprovedGlobalPosMappings, createPosMapping, createPosSource, deactivateApprovedPosMapping, listPosMappings, listPosSources, revisePendingPosMapping, updatePosMapping, updatePosSource } from "../controllers/posProductVariantMapping.controller.js";
import { declareClosedPosDay, listDailyPosStatus } from "../controllers/posDailyMonitoring.controller.js";
import { createOpeningInventoryBaseline, listOpeningInventoryBaselines } from "../controllers/openingInventory.controller.js";

export const posSalesRouter = Router();
posSalesRouter.use(authenticate, authorize("OWNER", "BRANCH_MANAGER"));
posSalesRouter.get("/analytics", asyncHandler(getPosAnalytics));
posSalesRouter.get("/daily-status", asyncHandler(listDailyPosStatus));
posSalesRouter.post("/daily-status/closed", authorize("BRANCH_MANAGER"), asyncHandler(declareClosedPosDay));
posSalesRouter.get("/sources", asyncHandler(listPosSources));
posSalesRouter.post("/sources", authorize("OWNER"), asyncHandler(createPosSource));
posSalesRouter.patch("/sources/:id", authorize("OWNER"), asyncHandler(updatePosSource));
posSalesRouter.delete("/sources/:id", authorize("OWNER"), asyncHandler(deletePosSourceConfiguration));
posSalesRouter.get("/mappings", asyncHandler(listPosMappings));
posSalesRouter.post("/mappings", authorize("OWNER"), asyncHandler(createPosMapping));
posSalesRouter.post("/mappings/copy", authorize("OWNER"), asyncHandler(copyApprovedGlobalPosMappings));
posSalesRouter.put("/mappings/:id", authorize("OWNER"), asyncHandler(revisePendingPosMapping));
posSalesRouter.patch("/mappings/:id", authorize("OWNER"), asyncHandler(updatePosMapping));
posSalesRouter.post("/mappings/:id/deactivate", authorize("OWNER"), asyncHandler(deactivateApprovedPosMapping));
posSalesRouter.get("/", asyncHandler(listPosImports));
posSalesRouter.post("/:id/authorize-cleanup", authorize("OWNER"), asyncHandler(authorizePosImportCleanup));
posSalesRouter.delete("/:id", authorize("OWNER"), asyncHandler(deletePosImport));
const posFileBody = raw({ type: "application/octet-stream", limit: "4mb" });
posSalesRouter.post("/preview", authorize("BRANCH_MANAGER"), posFileBody, asyncHandler(previewPosSales));
posSalesRouter.post("/import", authorize("BRANCH_MANAGER"), posFileBody, asyncHandler(importPosSales));

export const inventoryWorkflowRouter = Router();
inventoryWorkflowRouter.use(authenticate, authorize("OWNER", "BRANCH_MANAGER"));
inventoryWorkflowRouter.get("/expected", asyncHandler(getExpectedInventory));
inventoryWorkflowRouter.get("/variances", asyncHandler(listInventoryVariances));
inventoryWorkflowRouter.post("/variances/:id/void", asyncHandler(voidVarianceRecord));
inventoryWorkflowRouter.get("/uat-history", authorize("OWNER"), asyncHandler(listUatInventoryCounts));
inventoryWorkflowRouter.get("/uat-history/:id", authorize("OWNER"), asyncHandler(getUatInventoryCount));
inventoryWorkflowRouter.get("/", asyncHandler(listInventoryCounts));
inventoryWorkflowRouter.get("/:id", asyncHandler(getInventoryCount));
inventoryWorkflowRouter.post("/", authorize("BRANCH_MANAGER"), asyncHandler(submitInventoryCount));
inventoryWorkflowRouter.patch("/:id", authorize("BRANCH_MANAGER"), asyncHandler(updateInventoryCount));
inventoryWorkflowRouter.post("/:id/classify-uat-test", authorize("OWNER"), asyncHandler(classifyInventoryCountAsTestData));

export const inventoryMovementRouter = Router();
inventoryMovementRouter.use(authenticate, authorize("OWNER", "BRANCH_MANAGER"));
inventoryMovementRouter.post("/", authorize("OWNER", "BRANCH_MANAGER"), asyncHandler(createInventoryMovement));

export const openingInventoryRouter = Router();
openingInventoryRouter.use(authenticate, authorize("OWNER", "BRANCH_MANAGER"));
openingInventoryRouter.get("/", asyncHandler(listOpeningInventoryBaselines));
openingInventoryRouter.post("/", authorize("OWNER"), asyncHandler(createOpeningInventoryBaseline));

export const shrinkageReportRouter = Router();
shrinkageReportRouter.use(authenticate, authorize("OWNER", "BRANCH_MANAGER"));
shrinkageReportRouter.get("/", asyncHandler(listShrinkageReports));
shrinkageReportRouter.get("/:id", asyncHandler(getShrinkageReport));
shrinkageReportRouter.get("/:id/evidence", asyncHandler(getShrinkageEvidence));
shrinkageReportRouter.post("/:id/archive", asyncHandler(archiveShrinkageReport));
shrinkageReportRouter.patch("/:id/investigation", authorize("BRANCH_MANAGER"), asyncHandler(submitShrinkageInvestigation));
shrinkageReportRouter.post("/:id/review", authorize("OWNER"), asyncHandler(reviewShrinkageReport));

export const notificationRouter = Router();
notificationRouter.use(authenticate);
notificationRouter.get("/", asyncHandler(listNotifications));
notificationRouter.patch("/read-all", asyncHandler(markAllNotificationsRead));
notificationRouter.patch("/:id/read", asyncHandler(markNotificationRead));
