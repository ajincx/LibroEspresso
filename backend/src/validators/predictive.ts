import { z } from "zod";
import { manilaBusinessDate } from "../services/businessTime.service.js";

const today = () => manilaBusinessDate();

export const predictiveForecastInput = z.object({
  branchId: z.string().uuid().optional(),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
}).superRefine((value, ctx) => {
  if (value.startDate < today()) ctx.addIssue({ code: "custom", path: ["startDate"], message: "Forecast start date cannot be in the past" });
  if (value.endDate < value.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after start date" });
  const days = Math.floor((Date.parse(value.endDate) - Date.parse(value.startDate)) / 86_400_000) + 1;
  if (days > 365) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Forecast period cannot exceed 365 days" });
});
