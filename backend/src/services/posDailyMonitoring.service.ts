export type DailyPosStatus = "UPLOADED" | "DUE_TODAY" | "MISSING_UPLOAD" | "LATE_UPLOAD" | "UPCOMING" | "NO_SALES_CLOSED" | "POS_SOURCE_NOT_CONFIGURED";

function manilaDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function resolveDailyPosStatus(input: {
  businessDate: string;
  today: string;
  hasConfiguredSource: boolean;
  hasImport: boolean;
  importedAt?: string | null;
  closed: boolean;
}): DailyPosStatus {
  if (!input.hasConfiguredSource) return "POS_SOURCE_NOT_CONFIGURED";
  if (input.closed) return "NO_SALES_CLOSED";
  if (input.hasImport) {
    return input.importedAt && manilaDate(input.importedAt) > input.businessDate ? "LATE_UPLOAD" : "UPLOADED";
  }
  if (input.businessDate < input.today) return "MISSING_UPLOAD";
  if (input.businessDate > input.today) return "UPCOMING";
  return "DUE_TODAY";
}
