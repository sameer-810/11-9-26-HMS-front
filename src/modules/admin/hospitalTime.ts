/**
 * Calendar dates and midnights in the hospital's timezone, which may not be the device's.
 * Mirrors the API's utils/hospitalTime.js.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const WALL_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parts(instant: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return Object.fromEntries(
    dtf.formatToParts(instant).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
}

/** Minutes the zone is ahead of UTC at this instant; 0 for an unknown zone. */
function offsetMinutes(instant: Date, timeZone: string): number {
  try {
    const p = parts(instant, timeZone);
    const asIfUtc = Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      // Some engines report midnight as "24".
      +p.hour % 24,
      +p.minute,
      +p.second,
    );
    return (asIfUtc - instant.getTime()) / 60000;
  } catch {
    return 0;
  }
}

/** Today's "YYYY-MM-DD" in the hospital's zone. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  try {
    const p = parts(now, timeZone);
    return `${p.year}-${p.month}-${p.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function isCalendarDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** "2026-09-16" → the ISO instant of 00:00 that day in the zone. */
export function zoneMidnight(dateStr: string, timeZone: string): string {
  const m = DATE_RE.exec(dateStr);
  if (!m) return dateStr;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  // Looked up twice so a DST change on the day does not put it an hour out.
  const first = naive - offsetMinutes(new Date(naive), timeZone) * 60000;
  const second = naive - offsetMinutes(new Date(first), timeZone) * 60000;
  return new Date(second).toISOString();
}

/** The same instant back as a calendar date in the zone. */
export function calendarDateInZone(iso: string, timeZone: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : todayInZone(timeZone, d);
}
