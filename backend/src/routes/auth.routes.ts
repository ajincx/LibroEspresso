import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login, logout, me } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authRouter = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });
authRouter.post("/login", loginLimiter, asyncHandler(login));
authRouter.post("/logout", asyncHandler(logout));
authRouter.get("/me", authenticate, asyncHandler(me));
