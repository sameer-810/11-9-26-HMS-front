/**
 * Plain-English labels for workflow codes the API sends ("in_consultation" → "In consultation").
 * One map for patient, appointment, admission and related states; unknown codes fall back to
 * the code with underscores as spaces and a capital first letter, so nothing raw reaches a screen.
 */
const STATUS_LABELS: Record<string, string> = {
  // Patient and appointment
  registered: "Registered",
  scheduled: "Scheduled",
  arrived: "Arrived",
  in_consultation: "In consultation",
  admitted: "Admitted",
  discharged: "Discharged",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Did not attend",

  // Admission
  transferred_out: "Transferred out",
  lama: "Left against medical advice",
  deceased: "Deceased",

  // Discharge type
  routine: "Routine discharge",
  against_advice: "Against medical advice",
  referred: "Referred to another hospital",
  absconded: "Absconded",

  // Drug administration
  given: "Given",
  omitted: "Not given",
  refused: "Refused by patient",
  withheld: "Withheld",
  self_administered: "Self-administered",

  // Nursing note categories and shifts
  general: "General",
  assessment: "Assessment",
  intervention: "Intervention",
  incident: "Incident",
  family: "Family communication",
  escalation: "Escalation",
  morning: "Morning",
  evening: "Evening",
  night: "Night",
};

export function statusLabel(code: string | null | undefined): string {
  const key = String(code ?? "").trim();
  if (!key) return "";
  const known = STATUS_LABELS[key] ?? STATUS_LABELS[key.toLowerCase()];
  if (known) return known;
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
