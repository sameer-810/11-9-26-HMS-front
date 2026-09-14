/**
 * Every value interpolated into a printed document goes through this.
 *
 * Printed documents are built as HTML strings, and the strings come from the
 * record: names, allergy substances, instructions, lab comments. Any of those
 * can contain `<` — "<5 mmol/L" is a real result — and a name typed as
 * `<img src=x onerror=…>` would otherwise run in the print frame with this
 * app's origin and session. Escaping at the one interpolation helper, rather
 * than per field, means a new field cannot be added unescaped by forgetting.
 */
const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'`]/g, (c) => ENTITIES[c]);
}

/**
 * Tagged template that escapes every interpolation.
 *
 * `raw()` marks markup this module built itself (a barcode SVG, a nested
 * fragment) as already safe. Anything else — including a number — is escaped.
 */
export interface SafeHtml {
  readonly __html: string;
}

export function raw(markup: string): SafeHtml {
  return { __html: markup };
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0];
  values.forEach((v, i) => {
    out += renderValue(v) + strings[i + 1];
  });
  return { __html: out };
}

function renderValue(v: unknown): string {
  if (Array.isArray(v)) return v.map(renderValue).join("");
  if (v && typeof v === "object" && "__html" in v) return (v as SafeHtml).__html;
  if (v === false) return "";
  return escapeHtml(v);
}
