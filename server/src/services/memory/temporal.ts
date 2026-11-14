import * as chrono from 'chrono-node';
import type { TemporalRange } from './types.js';

/**
 * Calculates the UTC offset in minutes for a given IANA timezone at a reference instant.
 */
export function getTimezoneOffsetMinutes(timeZone: string, date: Date = new Date()): number {
  try {
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
    return Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
  } catch {
    // If timezone is invalid or unrecognized, fallback to UTC (offset 0)
    return 0;
  }
}

/**
 * Converts a local wall-clock timestamp in the given IANA timezone to an exact UTC Date.
 * Uses iterative convergence to resolve DST shifts accurately.
 */
export function localToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = 'UTC'
): Date {
  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  for (let i = 0; i < 3; i++) {
    try {
      const tzDate = new Date(utc.toLocaleString('en-US', { timeZone }));
      const utcDate = new Date(utc.toLocaleString('en-US', { timeZone: 'UTC' }));
      const offsetMs = tzDate.getTime() - utcDate.getTime();
      utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs);
    } catch {
      break;
    }
  }
  return utc;
}

/**
 * Parses relative and absolute date expressions in the user's IANA timezone
 * into a UTC [start, end) range.
 */
export function parseTemporalDate(
  text: string,
  timeZone = 'UTC',
  referenceNow: Date = new Date()
): TemporalRange | null {
  if (!text || typeof text !== 'string') return null;

  const tzOffset = getTimezoneOffsetMinutes(timeZone, referenceNow);

  // Special handling for "<time_of_day> of <date>" (e.g. "morning of October 10", "afternoon of October 11")
  const timeOfDayOfDateMatch = text.match(
    /\b(morning|afternoon|evening|night)\s+of\s+([A-Za-z]+(?:\s+\d{1,2})?(?:,?\s+\d{4})?)/i
  );
  if (timeOfDayOfDateMatch) {
    const period = timeOfDayOfDateMatch[1]!.toLowerCase();
    const dateText = timeOfDayOfDateMatch[2]!;
    const dateParsed = chrono.parse(
      dateText,
      { instant: referenceNow, timezone: tzOffset },
      { forwardDate: false }
    );
    if (dateParsed && dateParsed.length > 0) {
      const s = dateParsed[0]!.start;
      let sYear = s.get('year') ?? referenceNow.getUTCFullYear();
      const sMonth = s.get('month') ?? (referenceNow.getUTCMonth() + 1);
      const sDay = s.get('day') ?? referenceNow.getUTCDate();
      if (!s.isCertain('year')) {
        const tentative = localToUtc(sYear, sMonth, sDay, 0, 0, 0, timeZone);
        if (tentative.getTime() > referenceNow.getTime()) {
          sYear -= 1;
        }
      }
      let startHour = 6;
      let endHour = 12;
      if (period === 'afternoon') {
        startHour = 12;
        endHour = 18;
      } else if (period === 'evening' || period === 'night') {
        startHour = 18;
        endHour = 24;
      }
      const start = localToUtc(sYear, sMonth, sDay, startHour, 0, 0, timeZone);
      const end = localToUtc(sYear, sMonth, sDay, endHour, 0, 0, timeZone);
      return { start, end, text: timeOfDayOfDateMatch[0] };
    }
  }

  const parsedResults = chrono.parse(
    text,
    { instant: referenceNow, timezone: tzOffset },
    { forwardDate: false }
  );

  if (!parsedResults || parsedResults.length === 0) {
    return null;
  }

  const match = parsedResults[0]!;
  const matchedTextLower = match.text.toLowerCase();

  // Special handling for "last week" / "past week"
  if (matchedTextLower.includes('last week') || matchedTextLower.includes('past week')) {
    const nowYear = referenceNow.getUTCFullYear();
    const nowMonth = referenceNow.getUTCMonth() + 1;
    const nowDay = referenceNow.getUTCDate();
    const todayMidnight = localToUtc(nowYear, nowMonth, nowDay, 0, 0, 0, timeZone);
    const start = new Date(todayMidnight.getTime() - 7 * 24 * 3600 * 1000);
    return { start, end: todayMidnight, text: match.text };
  }

  const s = match.start;
  let sYear = s.get('year') ?? referenceNow.getUTCFullYear();
  const sMonth = s.get('month') ?? (referenceNow.getUTCMonth() + 1);
  const sDay = s.get('day') ?? referenceNow.getUTCDate();

  // Past context adjustment: if no year was explicitly stated and parsed date is in future, adjust back 1 year
  if (!s.isCertain('year')) {
    const tentativeStart = localToUtc(sYear, sMonth, sDay, 0, 0, 0, timeZone);
    if (tentativeStart.getTime() > referenceNow.getTime()) {
      sYear -= 1;
    }
  }

  // If no specific hour was specified, treat as full calendar day [00:00:00, 24:00:00)
  if (!s.isCertain('hour')) {
    const start = localToUtc(sYear, sMonth, sDay, 0, 0, 0, timeZone);

    if (match.end && !match.end.isCertain('hour')) {
      const e = match.end;
      const eYear = e.get('year') ?? sYear;
      const eMonth = e.get('month') ?? sMonth;
      const eDay = e.get('day') ?? sDay;
      const endNextDay = new Date(Date.UTC(eYear, eMonth - 1, eDay + 1));
      const end = localToUtc(
        endNextDay.getUTCFullYear(),
        endNextDay.getUTCMonth() + 1,
        endNextDay.getUTCDate(),
        0,
        0,
        0,
        timeZone
      );
      return { start, end, text: match.text };
    }

    // Default single day: end is next day 00:00:00 local time
    const nextDay = new Date(Date.UTC(sYear, sMonth - 1, sDay + 1));
    const end = localToUtc(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
      0,
      0,
      0,
      timeZone
    );
    return { start, end, text: match.text };
  }

  // Special handling for time-of-day phrases: morning, afternoon, evening
  if (matchedTextLower.includes('morning')) {
    const start = localToUtc(sYear, sMonth, sDay, 6, 0, 0, timeZone);
    const end = localToUtc(sYear, sMonth, sDay, 12, 0, 0, timeZone);
    return { start, end, text: match.text };
  }
  if (matchedTextLower.includes('afternoon')) {
    const start = localToUtc(sYear, sMonth, sDay, 12, 0, 0, timeZone);
    const end = localToUtc(sYear, sMonth, sDay, 18, 0, 0, timeZone);
    return { start, end, text: match.text };
  }
  if (matchedTextLower.includes('evening')) {
    const start = localToUtc(sYear, sMonth, sDay, 18, 0, 0, timeZone);
    const end = localToUtc(sYear, sMonth, sDay, 23, 59, 59, timeZone);
    return { start, end, text: match.text };
  }

  // Exact time specified
  const sHour = s.get('hour') ?? 0;
  const sMin = s.get('minute') ?? 0;
  const sSec = s.get('second') ?? 0;
  const start = localToUtc(sYear, sMonth, sDay, sHour, sMin, sSec, timeZone);

  if (match.end) {
    const e = match.end;
    const eYear = e.get('year') ?? sYear;
    const eMonth = e.get('month') ?? sMonth;
    const eDay = e.get('day') ?? sDay;
    const eHour = e.get('hour') ?? 23;
    const eMin = e.get('minute') ?? 59;
    const eSec = e.get('second') ?? 59;
    const end = localToUtc(eYear, eMonth, eDay, eHour, eMin, eSec, timeZone);
    return { start, end, text: match.text };
  }

  // Default duration: 1 hour
  const end = new Date(start.getTime() + 3600 * 1000);
  return { start, end, text: match.text };
}

