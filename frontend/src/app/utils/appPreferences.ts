export type AppPreferences = {
  theme: string;
  dateFormat: string;
  timezone: string;
  currency: string;
  compactSidebar: boolean;
};
export const defaultAppPreferences: AppPreferences = {
  theme: "light",
  dateFormat: "MMM d, yyyy",
  timezone: "Asia/Manila",
  currency: "PHP",
  compactSidebar: false,
};
export function readAppPreferences(): AppPreferences {
  try {
    return {
      ...defaultAppPreferences,
      ...JSON.parse(localStorage.getItem("libro.preferences.active") ?? "{}"),
    };
  } catch {
    return defaultAppPreferences;
  }
}
export function applyAppPreferences(value: AppPreferences) {
  localStorage.setItem("libro.preferences.active", JSON.stringify(value));
  localStorage.setItem("libro.theme", value.theme);
  localStorage.setItem("libro.sidebar.collapsed", String(value.compactSidebar));
  window.dispatchEvent(
    new CustomEvent("libro-preferences-change", { detail: value }),
  );
}
export function formatAppDate(value: string | Date, withTime = false) {
  const p = readAppPreferences();
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value);
  const dateOptions: Intl.DateTimeFormatOptions =
    p.dateFormat === "MM/dd/yyyy"
      ? { month: "2-digit", day: "2-digit", year: "numeric" }
      : p.dateFormat === "dd/MM/yyyy"
        ? { day: "2-digit", month: "2-digit", year: "numeric" }
        : { month: "short", day: "numeric", year: "numeric" };
  return new Intl.DateTimeFormat("en-PH", {
    ...dateOptions,
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: p.timezone,
  }).format(date);
}
export function formatAppCurrency(value: number) {
  const p = readAppPreferences();
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: p.currency,
    maximumFractionDigits: 2,
  }).format(value);
}
