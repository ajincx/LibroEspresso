import { api } from "./api";
import type { ApiSuccess, AuthUser } from "../types/auth";

export const accountService = {
  async updateProfile(input: { firstName: string; lastName: string; email: string; phoneNumber: string | null }) {
    return (await api.patch<ApiSuccess<{ user: AuthUser }>>("/profile", input)).data.data.user;
  },
  async updatePassword(input: { currentPassword: string; newPassword: string }) {
    await api.patch("/profile/password", input);
  },
};
