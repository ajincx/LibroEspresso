import { Router } from "express";
import { forgotPassword, login, logout, me, resetPassword } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.js";
import { loginLimiter } from "../middleware/loginRateLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authRouter = Router();
authRouter.post("/login", loginLimiter, asyncHandler(login));
authRouter.post("/forgot-password", loginLimiter, asyncHandler(forgotPassword));
authRouter.post("/reset-password", loginLimiter, asyncHandler(resetPassword));
authRouter.post("/logout", asyncHandler(logout));
authRouter.get("/me", authenticate, asyncHandler(me));
