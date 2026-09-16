/**
 * formatting, and calendar-date arithmetic on "YYYY-MM-DD" strings rather than Date:
 * new Date("2026-09-15") is UTC midnight, which is the previous day in western timezones.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** today, in the device's local calendar. */
export function todayCalendarDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

/** shifts a calendar date by whole days, staying a calendar date. */
export function addCalendarDays(dateStr: string, days: number): string {
  const m = DATE_RE.exec(dateStr);
  if (!m) return dateStr;
  // Date.UTC avoids local-timezone shifts; only the parts are read back out.
  const shifted = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(
    shifted.getUTCDate(),
  ).padStart(2, "0")}`;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** weekday of a calendar date, read from the parts rather than a parsed Date. */
export function calendarDayName(dateStr: string): string {
  const m = DATE_RE.exec(dateStr);
  if (!m) return "";
  return DAY_NAMES[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
}

/** "Tue 15 Sep 2026", or "Today" / "Tomorrow" when that is more useful. */
export function formatCalendarDate(
  dateStr: string,
  now: Date = new Date(),
): string {
  const m = DATE_RE.exec(dateStr);
  if (!m) return dateStr;

  const today = todayCalendarDate(now);
  if (dateStr === today) return `Today, ${shortDate(dateStr)}`;
  if (dateStr === addCalendarDays(today, 1))
    return `Tomorrow, ${shortDate(dateStr)}`;
  if (dateStr === addCalendarDays(today, -1))
    return `Yesterday, ${shortDate(dateStr)}`;
  return `${calendarDayName(dateStr).slice(0, 3)}, ${shortDate(dateStr)}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function shortDate(dateStr: string): string {
  const m = DATE_RE.exec(dateStr);
  if (!m) return dateStr;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** "10:00" → "10:00 am". */
export function formatWallTime(time: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  const suffix = h < 12 ? "am" : "pm";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${m[2]} ${suffix}`;
}

/** an ISO instant as a local date and time. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTimeOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/** "45 min", "2 h 10 min". */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Indian digit grouping: 1,23,456 rather than 123,456. */
export function formatNumber(n: number): string {
  return n.toLocaleString("en-IN");
}

export function formatRupees(amount: number | null | undefined): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "₹0.00";
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
