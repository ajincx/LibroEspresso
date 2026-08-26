export type UserRole = "OWNER" | "BRANCH_MANAGER";
export interface TokenUser { id: string; role: UserRole; branchId: string | null }

declare global {
  namespace Express { interface Request { user?: TokenUser } }
}
