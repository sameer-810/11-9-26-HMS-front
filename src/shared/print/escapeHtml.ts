/**
 * HTML escaping for printed documents. All interpolation goes through `html`, so record
 * text (which can contain `<`) can never inject markup into the print frame.
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

/** Markup from `html` or `raw()`; every other interpolated value is escaped. */
export interface SafeHtml {
  readonly __html: string;
}

/** Trust only objects minted here, not any JSON that happens to have an `__html` key. */
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

export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): SafeHtml {
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
