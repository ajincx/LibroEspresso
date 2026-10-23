import { readAppPreferences } from './appPreferences';

export function businessDate(now = new Date(), timezone = readAppPreferences().timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function businessDateTime(now = new Date(), timezone = readAppPreferences().timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}
export function manilaBusinessDateTime(now = new Date()) {
  return businessDateTime(now, "Asia/Manila");
}
export function manilaDateTimeToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Incident date and time is invalid.");
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year=Number(yearText),month=Number(monthText),day=Number(dayText),hour=Number(hourText),minute=Number(minuteText);
  const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
  if (month<1||month>12||day<1||day>daysInMonth||hour>23||minute>59) throw new Error("Incident date and time is invalid.");
  const parsed = new Date(Date.UTC(year,month-1,day,hour-8,minute));
  return parsed.toISOString();
}
export function validateIncidentDateTime(value: string, now = new Date()) {
  try {
    const parsed = new Date(manilaDateTimeToIso(value));
    return parsed.getTime() > now.getTime() ? "Incident date and time cannot be in the future." : "";
  } catch {
    return "Incident date and time is invalid.";
  }
}
export function addDateDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
export function periodDates(range: string, customStart?: string, customEnd?: string) {
  const endDate = businessDate();
  if (range === 'custom' && customStart && customEnd) return { startDate: customStart, endDate: customEnd };
  return { startDate: range === 'today' ? endDate : range === '7d' ? addDateDays(endDate, -6) : range === '30d' ? addDateDays(endDate, -29) : `${endDate.slice(0,7)}-01`, endDate };
}

export type DateRangeAdjustment = {
  range: "today" | "7d" | "30d" | "mtd" | "custom";
  customStart?: string;
  customEnd?: string;
};

export function adjustRangeForImport(
  currentRange: string,
  currentStartDate: string,
  currentEndDate: string,
  importedDate: string,
  today = businessDate(),
): DateRangeAdjustment | null {
  if (currentRange === "today" && importedDate !== today) {
    if (importedDate.slice(0, 7) === today.slice(0, 7)) {
      return { range: "mtd" };
    }
  }
  if (importedDate < currentStartDate || importedDate > currentEndDate) {
    return {
      range: "custom",
      customStart: importedDate < currentStartDate ? importedDate : currentStartDate,
      customEnd: importedDate > currentEndDate ? importedDate : currentEndDate,
    };
  }
  return null;
}

export function adjustRangeForAutomaticImport(
  userSelected: boolean,
  currentRange: string,
  currentStartDate: string,
  currentEndDate: string,
  importedDate: string,
  today = businessDate(),
): DateRangeAdjustment | null {
  return userSelected
    ? null
    : adjustRangeForImport(currentRange, currentStartDate, currentEndDate, importedDate, today);
}
