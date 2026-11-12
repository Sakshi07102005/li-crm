// src/utils/time.ts
import { env } from '../config/env';

/** Default timezone for the application. */
export const APP_TIMEZONE = env.appTimezone || 'Asia/Kolkata';

/**
 * Returns a Date representing the start of today (00:00:00) in APP_TIMEZONE,
 * converted to a UTC Date instance.
 */
export function getStartOfToday(tz = APP_TIMEZONE): Date {
  const now = new Date();
  const locale = 'en-US';
  const options: Intl.DateTimeFormatOptions = {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  };
  const parts = new Intl.DateTimeFormat(locale, options).formatToParts(now);
  const year = Number(parts.find(p => p.type === 'year')!.value);
  const month = Number(parts.find(p => p.type === 'month')!.value) - 1;
  const day = Number(parts.find(p => p.type === 'day')!.value);
  const tzMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const fmt = dtf.formatToParts(tzMidnight);
  const tzOffsetHours = Number(fmt.find(p => p.type === 'hour')!.value);
  const tzOffsetMinutes = Number(fmt.find(p => p.type === 'minute')!.value);
  return new Date(tzMidnight.getTime() - (tzOffsetHours * 60 + tzOffsetMinutes) * 60 * 1000);
}

/**
 * Returns a Date representing the end of the day (23:59:59.999) for the given
 * `date` (or today if omitted) in APP_TIMEZONE, converted to UTC.
 */
export function getEndOfToday(tz = APP_TIMEZONE, date?: Date): Date {
  const target = date ?? new Date();
  // Use the same logic as getStartOfToday but with the provided date.
  const locale = 'en-US';
  const options: Intl.DateTimeFormatOptions = {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  };
  const parts = new Intl.DateTimeFormat(locale, options).formatToParts(target);
  const year = Number(parts.find(p => p.type === 'year')!.value);
  const month = Number(parts.find(p => p.type === 'month')!.value) - 1;
  const day = Number(parts.find(p => p.type === 'day')!.value);
  const tzMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const fmt = dtf.formatToParts(tzMidnight);
  const tzOffsetHours = Number(fmt.find(p => p.type === 'hour')!.value);
  const tzOffsetMinutes = Number(fmt.find(p => p.type === 'minute')!.value);
  const utcMidnight = new Date(tzMidnight.getTime() - (tzOffsetHours * 60 + tzOffsetMinutes) * 60 * 1000);
  // Add 24h minus 1ms to get end of day.
  return new Date(utcMidnight.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/**
 * Returns a Date representing the end of the current week (Sunday 23:59:59.999)
 * in APP_TIMEZONE, converted to UTC.
 */
export function getEndOfThisWeek(tz = APP_TIMEZONE): Date {
  const start = getStartOfToday(tz);
  const day = start.getUTCDay();
  const daysToSunday = (7 - day) % 7;
  const sundayStart = new Date(start.getTime() + daysToSunday * 24 * 60 * 60 * 1000);
  return new Date(sundayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/**
 * Parses a date‑only string (YYYY‑MM‑DD) as the start/end of that day in APP_TIMEZONE.
 */
export function parseDateOnly(dateStr: string, tz = APP_TIMEZONE): { start: Date; end: Date } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  return { start, end };
}
