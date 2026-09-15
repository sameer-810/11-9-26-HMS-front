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

/**
 * Only markup made by `raw()` or `html` is trusted — not anything shaped like
 * it. Record fields arrive as parsed JSON, and a field that came back as
 * `{ "__html": "<img onerror=…>" }` must be escaped like any other value rather
 * than waved through because it has the right key.
 */
const minted = new WeakSet<object>();

function mint(markup: string): SafeHtml {
  const safe = Object.freeze({ __html: markup });
  minted.add(safe);
  return safe;
}

export function isSafeHtml(v: unknown): v is SafeHtml {
  return typeof v === "object" && v !== null && minted.has(v);
}

export function raw(markup: string): SafeHtml {
  return mint(markup);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0];
  values.forEach((v, i) => {
    out += renderValue(v) + strings[i + 1];
  });
  return mint(out);
}

function renderValue(v: unknown): string {
  if (Array.isArray(v)) return v.map(renderValue).join("");
  if (isSafeHtml(v)) return v.__html;
  if (v === false) return "";
  return escapeHtml(v);
}
