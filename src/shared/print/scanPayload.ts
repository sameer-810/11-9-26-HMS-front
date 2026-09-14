/**
 * What the 2D code on a label carries.
 *
 * `HMS1|P|<patientId>` on a wristband, `HMS1|S|<sampleId>` on a tube. The kind
 * letter means nothing has to be inferred from the shape of an identifier, and
 * the version means a later format can be refused instead of misread.
 *
 * The server's `scanCode.js` is the reader and the authority; this is only the
 * writer. The identifier check below mirrors its alphabet so a label is never
 * printed carrying something the scan endpoint will refuse — a band that
 * cannot scan is found out at the bedside, not at the printer.
 */

export const SCAN_PAYLOAD_VERSION = "HMS1";

const IDENTIFIER = /^[A-Z0-9][A-Z0-9-]{1,39}$/;

function checked(id: string): string {
  const value = String(id ?? "").trim().toUpperCase();
  if (!IDENTIFIER.test(value)) {
    throw new Error(`"${id}" cannot be encoded on a label`);
  }
  return value;
}

export function patientPayload(patientId: string): string {
  return `${SCAN_PAYLOAD_VERSION}|P|${checked(patientId)}`;
}

export function specimenPayload(sampleId: string): string {
  return `${SCAN_PAYLOAD_VERSION}|S|${checked(sampleId)}`;
}

/** For the 1D code, which carries the bare identifier so any scanner reads it. */
export function bareIdentifier(id: string): string {
  return checked(id);
}
