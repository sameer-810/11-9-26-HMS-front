import type { QueryKey } from "@tanstack/react-query";

/**
 * Pure rule for which patients the mirror must not keep. A break-the-glass read taints the
 * patient and their admissions, since bedside/notes payloads carry no break-glass marker.
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

const asShape = (data: unknown): Shape | null =>
  data && typeof data === "object" ? (data as Shape) : null;

const str = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

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
 * Adds break-the-glass patients and their admission ids to `tainted`. Accumulates across
 * calls, so a patient stays excluded after the emergency read leaves the cache.
 */
export function collectBreakGlassIds(
  candidates: MirrorCandidate[],
  tainted: Set<string>,
): Set<string> {
  for (const { key, data } of candidates) {
    if (!readViaBreakGlass(data)) continue;
    const id = subject(key);
    if (id) tainted.add(id);
    const patient = patientOf(data);
    if (patient) tainted.add(patient);
  }
  if (tainted.size === 0) return tainted;

  // Bedside/admission payloads name the patient and are keyed by admission id,
  // which observations, notes and the drug round share.
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
export function isTainted(
  { key, data }: MirrorCandidate,
  tainted: Set<string>,
): boolean {
  if (tainted.size === 0) return false;
  if (readViaBreakGlass(data)) return true;
  const id = subject(key);
  if (id && tainted.has(id)) return true;
  const patient = patientOf(data);
  return Boolean(patient && tainted.has(patient));
}
