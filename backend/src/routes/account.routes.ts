import { Router } from "express";
import { getProfile, updatePassword, updateProfile } from "../controllers/account.controller.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const accountRouter = Router();
accountRouter.use(authenticate);
accountRouter.get("/", asyncHandler(getProfile));
accountRouter.patch("/", asyncHandler(updateProfile));
accountRouter.patch("/password", asyncHandler(updatePassword));
