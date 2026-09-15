import type { QueryKey } from "@tanstack/react-query";

/**
 * Which patients the record mirror must not keep, decided from what is in the
 * cache. Pure, so the rule can be tested without a device.
 *
 * Only the record and the clinical context say how they were read
 * (`access.viaBreakGlass`). The bedside chart, observations, notes and drug
 * round of the same patient carry no such marker, so "skip entries flagged as
 * break-the-glass" alone would still write that patient's chart to the tablet
 * the moment the clinician moved from the emergency record to the bedside. The
 * emergency read therefore taints the PATIENT: their id, and the admissions the
 * cache shows belong to them, and every mirrored entry naming either is dropped
 * — including copies saved to disk before the emergency access began.
 */

export interface MirrorCandidate {
  key: QueryKey;
  data: unknown;
}

interface Shape {
  id?: unknown;
  access?: { viaBreakGlass?: unknown };
  patient?: { id?: unknown };
  admission?: { id?: unknown; patient?: { id?: unknown } };
}

const asShape = (data: unknown): Shape | null => (data && typeof data === "object" ? (data as Shape) : null);

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** The entity a mirrored query is about — the id every family puts second in its key. */
const subject = (key: QueryKey) => str(key[1]);

/** The patient a single-patient payload names, if it names one. */
function patientOf(data: unknown): string | null {
  const d = asShape(data);
  return str(d?.patient?.id) ?? str(d?.admission?.patient?.id);
}

export function readViaBreakGlass(data: unknown): boolean {
  return Boolean(asShape(data)?.access?.viaBreakGlass);
}

/**
 * Adds to `tainted` every patient read under break-the-glass in `candidates`,
 * and the admission ids the cache ties to them. Accumulates across calls, so a
 * patient stays excluded for the rest of the session after the emergency read
 * has left the cache.
 */
export function collectBreakGlassIds(candidates: MirrorCandidate[], tainted: Set<string>): Set<string> {
  for (const { key, data } of candidates) {
    if (!readViaBreakGlass(data)) continue;
    const id = subject(key);
    if (id) tainted.add(id);
    const patient = patientOf(data);
    if (patient) tainted.add(patient);
  }
  if (tainted.size === 0) return tainted;

  // Bedside and admission payloads name their patient; their key is the
  // admission, which is what observations, notes and the drug round are keyed by.
  for (const { key, data } of candidates) {
    const patient = patientOf(data);
    if (!patient || !tainted.has(patient)) continue;
    const id = subject(key);
    if (id) tainted.add(id);
    const admission = str(asShape(data)?.admission?.id);
    if (admission) tainted.add(admission);
  }
  return tainted;
}

/** True when a mirrored entry is about a tainted patient or one of their admissions. */
export function isTainted({ key, data }: MirrorCandidate, tainted: Set<string>): boolean {
  if (tainted.size === 0) return false;
  if (readViaBreakGlass(data)) return true;
  const id = subject(key);
  if (id && tainted.has(id)) return true;
  const patient = patientOf(data);
  return Boolean(patient && tainted.has(patient));
}
