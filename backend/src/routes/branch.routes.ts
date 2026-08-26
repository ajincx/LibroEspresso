import { Router } from "express";
import { createBranch,getBranch,listBranches,updateBranch } from "../controllers/branch.controller.js";
import { authenticate,authorize } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
export const branchRouter=Router(); branchRouter.use(authenticate); branchRouter.get("/",asyncHandler(listBranches)); branchRouter.post("/",authorize("OWNER"),asyncHandler(createBranch)); branchRouter.get("/:id",asyncHandler(getBranch)); branchRouter.patch("/:id",authorize("OWNER"),asyncHandler(updateBranch));
