import { Router } from "express";
import { authenticate, authorize, getEffectiveBranchId } from "../middleware/auth.js";

export const accessRouter = Router();
accessRouter.get("/owner-check", authenticate, authorize("OWNER"), (_req, res) => res.json({ success: true, data: { authorized: true } }));
accessRouter.get("/branch-scope", authenticate, (req, res) => {
  const requested = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  res.json({ success: true, data: { branchId: getEffectiveBranchId(req.user!, requested) ?? null } });
});
