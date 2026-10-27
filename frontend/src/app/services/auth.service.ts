import { api } from "./api";
import type { ApiSuccess, AuthUser } from "../types/auth";

export const authService = {
  async login(identifier: string, password: string) {
    const response = await api.post<ApiSuccess<{ user: AuthUser }>>("/auth/login", { identifier, password });
    return response.data.data.user;
  },
  async logout() {
    await api.post("/auth/logout");
  },
  async me() {
    const response = await api.get<ApiSuccess<{ user: AuthUser }>>("/auth/me");
    return response.data.data.user;
  },
  async forgotPassword(email:string){return (await api.post<ApiSuccess<{message:string}>>("/auth/forgot-password",{email})).data.data;},
  async resetPassword(token:string,password:string,confirmPassword:string){return (await api.post<ApiSuccess<{message:string}>>("/auth/reset-password",{token,password,confirmPassword})).data.data;},
};
