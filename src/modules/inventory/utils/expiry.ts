/**
 * Expiry as printed on a pack, read the same way the server reads it.
 *
 * Mirrors `stockRules.normaliseExpiry` so the receive form can show "usable
 * until 31 Mar 2027" while the date is typed. The server still parses it
 * again; this exists so a mistyped "03/27" is caught at the bench, not on
 * submit.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function parseExpiry(input: string): string | null {
  const s = input.trim();
  let m: RegExpExecArray | null;

  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo) ? s : null;
  }
  if ((m = /^(\d{1,2})[/-](\d{4})$/.exec(s))) {
    const [mo, y] = [Number(m[1]), Number(m[2])];
    return mo >= 1 && mo <= 12 ? `${y}-${pad(mo)}-${pad(daysInMonth(y, mo))}` : null;
  }
  if ((m = /^(\d{4})-(\d{1,2})$/.exec(s))) {
    const [y, mo] = [Number(m[1]), Number(m[2])];
    return mo >= 1 && mo <= 12 ? `${y}-${pad(mo)}-${pad(daysInMonth(y, mo))}` : null;
  }
  return null;
}

/** "2027-03-31" → "31 Mar 2027". A calendar date, never shifted by timezone. */
export function formatExpiry(date: string | null | undefined): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
