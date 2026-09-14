import { shortDate } from "@shared/format";
import type { PrintAllergies } from "@modules/printing/types";

/**
 * Rules every printed document shares, so a wristband and the prescription
 * handed over with it cannot disagree about how a name or an allergy reads.
 */

/** "1 Jan 1970". Month as a word, so 03/04 is never read the American way. */
export function formatDob(dateOfBirth: string | null | undefined): string | null {
  if (!dateOfBirth) return null;
  const calendar = String(dateOfBirth).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(calendar) ? shortDate(calendar) : null;
}

export function sexLabel(gender: string): string {
  if (gender === "male") return "Male";
  if (gender === "female") return "Female";
  if (gender === "other") return "Other";
  return "Sex not recorded";
}

export interface PrintedName {
  /** Upper case — see below. */
  surname: string;
  given: string;
  unidentified: boolean;
  /** The ED visit number an unidentified patient is registered under. */
  visitNumber: string | null;
}

/**
 * The name as identity labels print it: SURNAME, Given.
 *
 * The surname in capitals is the wristband convention (NPSA 2007, "Standardising
 * wristbands improves patient safety") — two patients called Priya on one ward
 * are told apart by the surname, so it is the part that must be read first. The
 * design system's no-ALL-CAPS rule is about sentences someone has to read
 * quickly; a surname on a label is matched, not read.
 *
 * An unidentified emergency patient is registered as "Unidentified ED-000042"
 * (emergency.service.js). That prints as UNIDENTIFIED with the visit number,
 * never as a surname "ED-000042" that looks like a real person's.
 */
export function printedName(firstName: string, lastName: string): PrintedName {
  const first = (firstName || "").trim();
  const last = (lastName || "").trim();
  if (first.toLowerCase() === "unidentified" && /^ED-\d+$/i.test(last)) {
    return { surname: "UNIDENTIFIED", given: "", unidentified: true, visitNumber: last.toUpperCase() };
  }
  if (!last) return { surname: first.toUpperCase(), given: "", unidentified: false, visitNumber: null };
  return { surname: last.toUpperCase(), given: first, unidentified: false, visitNumber: null };
}

export type AllergyState = "known" | "none" | "unrecorded";

/**
 * The allergy statement, never blank.
 *
 * "Not recorded" and "none" are opposite clinical statements (CLINICAL_SAFETY
 * §2) and each prints as words. When the list is too long for the space, the
 * substances that fit are printed and the rest are COUNTED — "+2 more, see
 * record" — because a silently truncated allergy list reads as a complete one.
 */
export function allergyStatement(
  { recorded, allergies }: PrintAllergies,
  maxChars = Number.POSITIVE_INFINITY,
): { state: AllergyState; text: string } {
  if (!recorded) return { state: "unrecorded", text: "Allergies not recorded" };
  if (allergies.length === 0) return { state: "none", text: "No known allergies" };

  // Life-threatening reactions first, so they are the ones that always fit.
  const rank = { anaphylaxis: 0, severe: 1, moderate: 2, mild: 3 } as const;
  const names = [...allergies]
    .sort((a, b) => (rank[a.severity] ?? 4) - (rank[b.severity] ?? 4))
    .map((a) => a.substance.trim())
    .filter(Boolean);

  const prefix = "ALLERGIES: ";
  const full = prefix + names.join(", ");
  if (full.length <= maxChars) return { state: "known", text: full };

  // The instruction to look at the record is dropped before the most dangerous
  // substance is: "ALLERGIES: Penicillin +3 more" still stops a hand reaching
  // for amoxicillin; "4 recorded" does not.
  for (const suffix of [" more, see record", " more"]) {
    for (let shown = names.length - 1; shown >= 1; shown--) {
      const text = `${prefix}${names.slice(0, shown).join(", ")} +${names.length - shown}${suffix}`;
      if (text.length <= maxChars) return { state: "known", text };
    }
  }
  return { state: "known", text: `${prefix}${names.length} recorded, see record` };
}
