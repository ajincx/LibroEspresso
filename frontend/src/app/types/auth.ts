export type UserRole = "OWNER" | "BRANCH_MANAGER";

export interface BranchSummary {
  id: string;
  code: string;
  name: string;
}

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  phoneNumber: string | null;
  position: string;
  role: UserRole;
  branchId: string | null;
  branch: BranchSummary | null;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: unknown };
}
