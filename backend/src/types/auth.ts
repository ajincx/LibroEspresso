export type UserRole = "OWNER" | "BRANCH_MANAGER" | "STAFF";
export interface TokenUser { id: string; role: UserRole; branchId: string | null; sessionId?: string }

declare global {
  namespace Express { interface Request { user?: TokenUser; requestId: string } }
}
