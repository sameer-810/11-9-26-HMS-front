import { mm } from "./sizing";
import { escapeHtml } from "./escapeHtml";

/**
 * A complete HTML document whose page is exactly `widthMm` × `heightMm`.
 *
 * `@page { size }` tells the print pipeline the paper size. For a label the
 * html/body box is pinned to the same size with overflow hidden, so content
 * that would spill onto a second label is clipped rather than feeding a blank
 * label out of the printer. A prescription or report instead flows onto a
 * second sheet, because clipping the last medicine off a prescription is far
 * worse than using two pages.
 *
 * What CSS cannot do is stop the browser's own print dialog from scaling the
 * page ("Fit to printable area", default margins). A web print can therefore
 * still come out shrunk, which is why the desktop shell prints through
 * `hmsDesktop.printExact` and why the web path tells the user to set scale 100%
 * and margins to none.
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
