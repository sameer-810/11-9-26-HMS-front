/**
 * Last-activity clock for idle sign-out (US-01). Module state avoids re-renders per tap;
 * on web it is mirrored to localStorage so activity in one tab keeps other tabs signed in.
 */

export const ACTIVITY_KEY = "hms-last-activity";
/** How long before the sign-out the warning appears. */
export const WARNING_MS = 60_000;
/** Throttle for activity writes. */
const THROTTLE_MS = 1_000;

let lastActivity = Date.now();

function readShared(): number {
  try {
    if (typeof localStorage === "undefined") return 0;
    return Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Record activity now. `force` skips the throttle — for "Stay signed in" and for signing in. */
export function recordActivity(force = false, now = Date.now()) {
  if (!force && now - lastActivity < THROTTLE_MS) return;
  lastActivity = now;
  try {
    if (typeof localStorage !== "undefined")
      localStorage.setItem(ACTIVITY_KEY, String(now));
  } catch {
    /* private window or storage full: this tab's own clock still works */
  }
}

export function lastActivityAt() {
  return Math.max(lastActivity, readShared());
}

export interface IdleState {
  /** Milliseconds until sign-out. */
  remaining: number;
  warn: boolean;
  expired: boolean;
}

/** Pure idle calculation; enforces the server's 5-minute minimum. */
export function idleState(
  lastActive: number,
  now: number,
  idleMinutes: number,
): IdleState {
  const limit = Math.max(5, idleMinutes || 30) * 60_000;
  const remaining = lastActive + limit - now;
  return {
    remaining,
    warn: remaining > 0 && remaining <= WARNING_MS,
    expired: remaining <= 0,
  };
}
