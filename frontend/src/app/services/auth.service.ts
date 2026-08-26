import { api } from "./api";
import type { ApiSuccess, AuthUser } from "../types/auth";

export const authService = {
  async login(identifier: string, password: string, remember = false) {
    const response = await api.post<ApiSuccess<{ user: AuthUser }>>("/auth/login", { identifier, password, remember });
    return response.data.data.user;
  },
  async logout() {
    await api.post("/auth/logout");
  },
  async me() {
    const response = await api.get<ApiSuccess<{ user: AuthUser }>>("/auth/me");
    return response.data.data.user;
  },
};
