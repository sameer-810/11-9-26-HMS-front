/**
 * 2D label payloads: `HMS1|P|<patientId>` on wristbands, `HMS1|S|<sampleId>` on tubes.
 * The server's scanCode.js reads them; IDENTIFIER mirrors its alphabet so every printed label scans.
 */

export const SCAN_PAYLOAD_VERSION = "HMS1";

const IDENTIFIER = /^[A-Z0-9][A-Z0-9-]{1,39}$/;

function checked(id: string): string {
  const value = String(id ?? "")
    .trim()
    .toUpperCase();
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
