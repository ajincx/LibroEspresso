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
export function addDateDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
export function periodDates(range: string, customStart?: string, customEnd?: string) {
  const endDate = businessDate();
  if (range === 'custom' && customStart && customEnd) return { startDate: customStart, endDate: customEnd };
  return { startDate: range === 'today' ? endDate : range === '7d' ? addDateDays(endDate, -6) : range === '30d' ? addDateDays(endDate, -29) : `${endDate.slice(0,7)}-01`, endDate };
}
