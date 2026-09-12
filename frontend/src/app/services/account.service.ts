import { api } from "./api";
import type { ApiSuccess, AuthUser } from "../types/auth";
import type { AppPreferences } from "../utils/appPreferences";
export type NotificationPreferences = Record<string, boolean>;
export type OrganizationSettings = {
  businessName: string;
  legalName: string;
  contactEmail: string;
  contactPhone: string;
  headOfficeAddress: string;
  taxIdentifier: string;
  reportingCycle: "WEEKLY" | "MONTHLY" | "QUARTERLY";
  varianceToleranceQuantity: number;
  highCogsPercent: number;
  shrinkageAlertPercent: number;
  defaultReorderDays: number;
  branchCount: number;
  activeBranchCount: number;
};

export const accountService = {
  async updateProfile(input: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string | null;
  }) {
    return (await api.patch<ApiSuccess<{ user: AuthUser }>>("/profile", input))
      .data.data.user;
  },
  async updatePassword(input: {
    currentPassword: string;
    newPassword: string;
  }) {
    await api.patch("/profile/password", input);
  },
  async settings() {
    return (
      await api.get<
        ApiSuccess<{
          preferences: AppPreferences & {
            notifications: NotificationPreferences;
          };
          organization: OrganizationSettings | null;
        }>
      >("/profile/settings")
    ).data.data;
  },
  async updatePreferences(
    input: AppPreferences & { notifications: NotificationPreferences },
  ) {
    return (await api.patch("/profile/settings/preferences", input)).data.data
      .preferences;
  },
  async updateBusiness(
    input: Omit<OrganizationSettings, "branchCount" | "activeBranchCount">,
  ) {
    return (await api.patch("/profile/settings/business", input)).data.data
      .organization;
  },
};
