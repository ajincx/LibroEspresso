import { Router } from "express";
import { exportReportPdf, exportReportXlsx, previewReport } from "../controllers/reports.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const reportsRouter=Router();
reportsRouter.use(authenticate,authorize("OWNER","BRANCH_MANAGER"));
reportsRouter.post("/preview",asyncHandler(previewReport));
reportsRouter.post("/export/pdf",asyncHandler(exportReportPdf));
reportsRouter.post("/export/xlsx",asyncHandler(exportReportXlsx));
