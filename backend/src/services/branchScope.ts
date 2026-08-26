import type { TokenUser } from "../types/auth.js";
import { AppError } from "../utils/appError.js";
export function getEffectiveBranchId(user: TokenUser, requestedBranchId?: string) {
  if (user.role === "BRANCH_MANAGER") {
    if (!user.branchId) throw new AppError(403, "BRANCH_NOT_ASSIGNED", "No branch is assigned to this account");
    return user.branchId;
  }
  return requestedBranchId;
}
