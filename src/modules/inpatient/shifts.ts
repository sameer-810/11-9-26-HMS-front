import type { Handover, Shift } from "./types";

/**
 * Ward shifts on the device clock. The start hours match the API's shiftFor, which labels
 * notes and handovers: morning 07:00, evening 14:00, night 21:00.
 */
export const SHIFT_START_HOUR: Record<Shift, number> = {
  morning: 7,
  evening: 14,
  night: 21,
};

export const SHIFT_ORDER: Shift[] = ["morning", "evening", "night"];

export function shiftAt(date: Date): Shift {
  const hour = date.getHours();
  if (hour >= 7 && hour < 14) return "morning";
  if (hour >= 14 && hour < 21) return "evening";
  return "night";
}

export function nextShift(shift: Shift): Shift {
  return SHIFT_ORDER[(SHIFT_ORDER.indexOf(shift) + 1) % SHIFT_ORDER.length];
}

/** The most recent time this shift began, at or before `now`. */
export function latestShiftStart(shift: Shift, now: Date): Date {
  const start = new Date(now);
  start.setHours(SHIFT_START_HOUR[shift], 0, 0, 0);
  if (start.getTime() > now.getTime()) start.setDate(start.getDate() - 1);
  return start;
}

export type HandoverStatus =
  | { kind: "none" }
  | { kind: "waiting"; handover: Handover }
  | { kind: "taken"; handover: Handover };

/** The latest handover given from `shift` since that shift last began. */
export function handoverStatusFor(
  handovers: Handover[],
  shift: Shift,
  now: Date,
): HandoverStatus {
  const from = latestShiftStart(shift, now).getTime();
  const latest = handovers
    .filter(
      (h) => h.fromShift === shift && new Date(h.givenAt).getTime() >= from,
    )
    .sort(
      (a, b) => new Date(b.givenAt).getTime() - new Date(a.givenAt).getTime(),
    )[0];
  if (!latest) return { kind: "none" };
  return latest.receivedAt
    ? { kind: "taken", handover: latest }
    : { kind: "waiting", handover: latest };
}
