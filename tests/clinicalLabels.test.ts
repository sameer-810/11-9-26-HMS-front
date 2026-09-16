import test from "node:test";
import assert from "node:assert/strict";

import { nameWithStrength } from "../src/shared/utils/medicineName";
import { statusLabel } from "../src/shared/utils/statusLabels";

/** Medicine names on screens, labels and bills: the strength is never said twice. */

test("a brand that already carries the number gets only the unit", () => {
  assert.equal(nameWithStrength("Crocin 650", "650 mg"), "Crocin 650 mg");
  assert.equal(nameWithStrength("Pan 40", "40 mg"), "Pan 40 mg");
  assert.equal(nameWithStrength("Envas 5", "5mg"), "Envas 5mg");
});

test("a name without the number gets the whole strength", () => {
  assert.equal(nameWithStrength("Paracetamol", "500 mg"), "Paracetamol 500 mg");
  assert.equal(nameWithStrength("Amoxil", "250 mg/5 mL"), "Amoxil 250 mg/5 mL");
});

test("a number that only looks alike is not swallowed", () => {
  // "Dolo 650" with a 65 mg strength must not read "Dolo 650 mg".
  assert.equal(nameWithStrength("Dolo 650", "65 mg"), "Dolo 650 65 mg");
  assert.equal(nameWithStrength("Calpol650", "650 mg"), "Calpol650 650 mg");
  assert.equal(
    nameWithStrength("Insulin 2.5", "2.5 units"),
    "Insulin 2.5 units",
  );
});

test("missing parts are handled without stray spaces", () => {
  assert.equal(nameWithStrength("Crocin", ""), "Crocin");
  assert.equal(nameWithStrength("Crocin", null), "Crocin");
  assert.equal(nameWithStrength("  Crocin 650 ", " 650 mg "), "Crocin 650 mg");
  assert.equal(nameWithStrength("", "650 mg"), "650 mg");
  assert.equal(nameWithStrength("Zinc", "as directed"), "Zinc as directed");
});

test("workflow codes read as plain English", () => {
  assert.equal(statusLabel("in_consultation"), "In consultation");
  assert.equal(statusLabel("arrived"), "Arrived");
  assert.equal(statusLabel("registered"), "Registered");
  assert.equal(statusLabel("no_show"), "Did not attend");
  assert.equal(statusLabel("some_new_state"), "Some new state");
  assert.equal(statusLabel(""), "");
  assert.equal(statusLabel(undefined), "");
});
