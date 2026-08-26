import { Router } from "express";
import { createUser,getUser,listUsers,updateUser,updateUserStatus } from "../controllers/user.controller.js";
import { authenticate,authorize } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
export const userRouter=Router(); userRouter.use(authenticate,authorize("OWNER")); userRouter.get("/",asyncHandler(listUsers)); userRouter.post("/",asyncHandler(createUser)); userRouter.get("/:id",asyncHandler(getUser)); userRouter.patch("/:id",asyncHandler(updateUser)); userRouter.patch("/:id/status",asyncHandler(updateUserStatus));
