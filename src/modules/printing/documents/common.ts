import { shortDate } from "@shared/format";
import type { PrintAllergies } from "@modules/printing/types";


/** Name, date and allergy formatting shared by every printed document. */

/** "1 Jan 1970": month as a word, so the date is never ambiguous. */
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
 * "SURNAME, Given" per the NPSA wristband convention. Unidentified ED patients print
 * as UNIDENTIFIED plus visit number, never with "ED-000042" as a surname.
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
 * Allergy statement, never blank. "Not recorded" and "none" both print as words;
 * overflow is counted ("+2 more"), as a silently truncated list reads as complete.
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

  // Drop "see record" before dropping the most dangerous substance name.
  for (const suffix of [" more, see record", " more"]) {
    for (let shown = names.length - 1; shown >= 1; shown--) {
      const text = `${prefix}${names.slice(0, shown).join(", ")} +${names.length - shown}${suffix}`;
      if (text.length <= maxChars) return { state: "known", text };
    }
  }
  return { state: "known", text: `${prefix}${names.length} recorded, see record` };
}
