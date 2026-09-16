import { mm } from "./sizing";
import { escapeHtml } from "./escapeHtml";

/** CSP carried by every printed document: no script or fetch, so escaping bugs stay inert markup. */
export const PRINT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";

/**
 * Full HTML document sized `widthMm` × `heightMm`. Labels clip overflow (no blank second label);
 * "flow" documents run onto more sheets so nothing is cut off a prescription.
 */
export function pageDocument({
  title,
  widthMm,
  heightMm,
  css,
  body,
  documentKind,
  layout = "label",
  marginMm = 0,
}: {
  title: string;
  widthMm: number;
  heightMm: number;
  css: string;
  /** Already-escaped markup. */
  body: string;
  /** `data-print-document`, for the browser gate to find what it measures. */
  documentKind: string;
  /** "label": one fixed-size page. "flow": sheets that may run to more pages. */
  layout?: "label" | "flow";
  /** Flowing documents only — repeated on every sheet, unlike padding. */
  marginMm?: number;
}): string {
  const box =
    layout === "label"
      ? `width: ${mm(widthMm)}; height: ${mm(heightMm)}; overflow: hidden;`
      : `width: ${mm(widthMm - 2 * marginMm)};`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${PRINT_CSP}" />
<title>${escapeHtml(title)}</title>
<style>
@page { size: ${mm(widthMm)} ${mm(heightMm)}; margin: ${layout === "label" ? "0" : mm(marginMm)}; }
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  ${box}
  background: #FFFFFF;
  color: #000000;
  /* Thermal drivers rasterise whatever fonts exist on the machine. Arial and
     Helvetica are on every one of them; a web font that has not loaded when
     the print fires would silently fall back mid-label. */
  font-family: Arial, Helvetica, "Liberation Sans", sans-serif;
  /* Without this, Chromium drops background fills when printing — and the
     allergy band is a background fill. */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
svg { display: block; }
${css}
</style>
</head>
<body data-print-document="${escapeHtml(documentKind)}">
${body}
</body>
</html>`;
}
