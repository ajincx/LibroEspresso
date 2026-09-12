import type { ApiSuccess } from "../types/auth";
import type { PredictiveForecast } from "../types/predictive";
import { api } from "./api";

export const predictiveService = {
  async generate(input: { startDate: string; endDate: string; branchId?: string }) {
    return (await api.post<ApiSuccess<PredictiveForecast>>("/predictive-analytics/generate", input)).data.data;
  },
};
