import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { calculateNews2 } from "../src/shared/clinical/news2";

/**
 * The device's NEWS2 must be the server's NEWS2.
 *
 * The device copy only ever speaks when a set is charted offline — which is
 * exactly when nobody else is checking it. A threshold that drifted between the
 * two would tell a nurse "3, routine" for a patient the server will escalate as
 * a 7 twenty minutes later. So both copies run over the same inputs here, and
 * any difference fails.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const serverFile = path.resolve(here, "..", "..", "11-9-26-HMS-back", "src", "modules", "nursing", "news2.js");

type Calc = (input: unknown) => unknown;

async function server(): Promise<Calc> {
  const mod = (await import(pathToFileURL(serverFile).href)) as { calculateNews2: Calc };
  return mod.calculateNews2;
}

/** Deterministic, so a failure reproduces. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const pick = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];

// Every published boundary and the value either side of it.
const RR = [4, 8, 9, 11, 12, 20, 21, 24, 25, 40];
const SPO2 = [70, 83, 84, 85, 86, 87, 88, 91, 92, 93, 94, 95, 96, 97, 100];
const OXYGEN = [true, false, null, undefined];
const SBP = [60, 90, 91, 100, 101, 110, 111, 219, 220, 260];
const PULSE = [30, 40, 41, 50, 51, 90, 91, 110, 111, 130, 131, 180];
const ACVPU = ["alert", "confusion", "voice", "pain", "unresponsive", "", null];
const TEMP = [33, 35, 35.1, 36, 36.1, 38, 38.1, 39, 39.1, 41];
const ODD = [undefined, null, "", "  ", "sixteen", "18"];

test("device and server NEWS2 agree across thousands of observation sets", async () => {
  const serverCalc = await server();
  const r = rng(20260914);

  for (let i = 0; i < 20000; i++) {
    const withOdd = <T>(xs: T[]) => (r() < 0.08 ? pick(r, ODD) : pick(r, xs));
    const input = {
      respiratoryRate: withOdd(RR),
      spo2: withOdd(SPO2),
      onOxygen: pick(r, OXYGEN),
      systolic: withOdd(SBP),
      pulse: withOdd(PULSE),
      consciousness: pick(r, ACVPU),
      temperatureC: withOdd(TEMP),
      useScale2: r() < 0.3,
    };
    assert.deepEqual(
      JSON.parse(JSON.stringify(calculateNews2(input as never))),
      JSON.parse(JSON.stringify(serverCalc(input))),
      `differs for ${JSON.stringify(input)}`,
    );
  }
});

test("each threshold, one parameter at a time, on both scales", async () => {
  const serverCalc = await server();
  const base = { respiratoryRate: 16, spo2: 97, onOxygen: false, systolic: 120, pulse: 70, consciousness: "alert", temperatureC: 37 };
  const sweeps: Record<string, unknown[]> = {
    respiratoryRate: RR,
    spo2: SPO2,
    onOxygen: OXYGEN,
    systolic: SBP,
    pulse: PULSE,
    consciousness: ACVPU,
    temperatureC: TEMP,
  };
  for (const useScale2 of [false, true]) {
    for (const onOxygen of [false, true]) {
      for (const [key, values] of Object.entries(sweeps)) {
        for (const value of values) {
          const input = { ...base, onOxygen, [key]: value, useScale2 };
          assert.deepEqual(
            JSON.parse(JSON.stringify(calculateNews2(input as never))),
            JSON.parse(JSON.stringify(serverCalc(input))),
            `differs for ${key}=${String(value)} scale2=${useScale2} onOxygen=${onOxygen}`,
          );
        }
      }
    }
  }
});
