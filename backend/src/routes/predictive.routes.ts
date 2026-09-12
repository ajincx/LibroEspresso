import { Router } from "express";
import { generatePredictiveForecast } from "../controllers/predictive.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const predictiveRouter = Router();
predictiveRouter.use(authenticate, authorize("OWNER", "BRANCH_MANAGER"));
predictiveRouter.post("/generate", asyncHandler(generatePredictiveForecast));
