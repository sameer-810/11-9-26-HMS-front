import test from "node:test";
import assert from "node:assert/strict";

import { idleState, WARNING_MS } from "../src/shared/session/activity";

/**
 * US-01 session timeout: when the warning shows and when the screen signs out.
 * The component only renders what this decides.
 */

const MIN = 60_000;
const t0 = Date.UTC(2026, 8, 15, 9, 0, 0);

test("quiet for less than the timeout minus a minute: no warning", () => {
  const s = idleState(t0, t0 + 28 * MIN, 30);
  assert.equal(s.warn, false);
  assert.equal(s.expired, false);
  assert.equal(s.remaining, 2 * MIN);
});

test("inside the last minute: warn, with the seconds left", () => {
  const s = idleState(t0, t0 + 30 * MIN - 45_000, 30);
  assert.equal(s.warn, true);
  assert.equal(s.expired, false);
  assert.equal(s.remaining, 45_000);
  assert.ok(s.remaining <= WARNING_MS);
});

test("at the timeout: signed out, not warned", () => {
  const s = idleState(t0, t0 + 30 * MIN, 30);
  assert.equal(s.expired, true);
  assert.equal(s.warn, false);
});

test("a setting under five minutes, or none, is not trusted", () => {
  assert.equal(idleState(t0, t0 + 3 * MIN, 1).expired, false, "the floor is five minutes, as on the server");
  assert.equal(idleState(t0, t0 + 29 * MIN, 0).expired, false, "no setting means the thirty-minute default");
});
