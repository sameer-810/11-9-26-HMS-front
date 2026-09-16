/**
 * "Crocin 650" + "650 mg" reads "Crocin 650 mg", not "Crocin 650 650 mg": many brands carry the
 * strength in the name, so only the unit is added when the name already ends with the number.
 * Mirrors the API's medicineName.js so screens and bill lines agree.
 */
export function nameWithStrength(
  name: string | null | undefined,
  strength: string | null | undefined,
): string {
  const brand = String(name ?? "").trim();
  const dose = String(strength ?? "").trim();
  if (!dose) return brand;
  if (!brand) return dose;
  const number = /^\d+(?:\.\d+)?/.exec(dose)?.[0];
  const endsWithNumber =
    Boolean(number) && (brand === number || brand.endsWith(` ${number}`));
  return endsWithNumber && number
    ? `${brand}${dose.slice(number.length)}`
    : `${brand} ${dose}`;
}
