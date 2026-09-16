/**
 * When someone last touched the app — the clock behind the idle sign-out
 * (US-01 "session timeout").
 *
 * Kept in module state rather than React so the navigator's touch handler and
 * the timer read the same value without re-rendering on every tap. On the web
 * it is also written to localStorage, so a nurse working in one tab keeps the
 * other tab of the same session from signing out.
 */

export const ACTIVITY_KEY = "hms-last-activity";
/** How long before the sign-out the warning appears. */
export const WARNING_MS = 60_000;
/** Taps closer together than this are one activity; a write per mouse move would be wasteful. */
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
    if (typeof localStorage !== "undefined") localStorage.setItem(ACTIVITY_KEY, String(now));
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

/** Pure, for the timer and for tests. The server refuses anything under five minutes, and so does this. */
export function idleState(lastActive: number, now: number, idleMinutes: number): IdleState {
  const limit = Math.max(5, idleMinutes || 30) * 60_000;
  const remaining = lastActive + limit - now;
  return { remaining, warn: remaining > 0 && remaining <= WARNING_MS, expired: remaining <= 0 };
}
