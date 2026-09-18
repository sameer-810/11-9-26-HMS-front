import test from "node:test";
import assert from "node:assert/strict";

import {
  shiftAt,
  nextShift,
  latestShiftStart,
  handoverStatusFor,
} from "../src/modules/inpatient/shifts";
import type { Handover } from "../src/modules/inpatient/types";

/** Shift handover status: what counts as "this shift" on the ward clock. */

const at = (y: number, mo: number, d: number, h: number, mi = 0) =>
  new Date(y, mo - 1, d, h, mi);

const handover = (over: Partial<Handover>): Handover => ({
  id: "h1",
  admissionId: "a1",
  fromShift: "morning",
  toShift: "evening",
  situation: "s",
  background: "b",
  assessment: "a",
  recommendation: "r",
  outstandingTasks: [],
  alerts: [],
  news2AtHandover: null,
  bandAtHandover: null,
  givenBy: "Meera",
  givenAt: at(2026, 9, 17, 13, 30).toISOString(),
  receivedBy: "",
  receivedAt: null,
  outstanding: true,
  ...over,
});

test("shift boundaries match the API: 07:00, 14:00 and 21:00", () => {
  assert.equal(shiftAt(at(2026, 9, 17, 6, 59)), "night");
  assert.equal(shiftAt(at(2026, 9, 17, 7)), "morning");
  assert.equal(shiftAt(at(2026, 9, 17, 13, 59)), "morning");
  assert.equal(shiftAt(at(2026, 9, 17, 14)), "evening");
  assert.equal(shiftAt(at(2026, 9, 17, 21)), "night");
  assert.equal(nextShift("night"), "morning");
});

test("the night shift that began yesterday is still this shift at 03:00", () => {
  assert.deepEqual(
    latestShiftStart("night", at(2026, 9, 17, 3)),
    at(2026, 9, 16, 21),
  );
  assert.deepEqual(
    latestShiftStart("morning", at(2026, 9, 17, 10)),
    at(2026, 9, 17, 7),
  );
});

test("no handover, waiting, then taken", () => {
  const now = at(2026, 9, 17, 13, 45);
  assert.equal(handoverStatusFor([], "morning", now).kind, "none");
  assert.equal(
    handoverStatusFor([handover({})], "morning", now).kind,
    "waiting",
  );
  const taken = handoverStatusFor(
    [
      handover({
        receivedBy: "Anita",
        receivedAt: at(2026, 9, 17, 14, 5).toISOString(),
      }),
    ],
    "morning",
    at(2026, 9, 17, 15),
  );
  assert.equal(taken.kind, "taken");
});

test("yesterday's handover, or another shift's, does not count", () => {
  const now = at(2026, 9, 17, 13, 45);
  const yesterday = handover({
    givenAt: at(2026, 9, 16, 13, 30).toISOString(),
  });
  const evening = handover({ fromShift: "evening" });
  assert.equal(
    handoverStatusFor([yesterday, evening], "morning", now).kind,
    "none",
  );
});
