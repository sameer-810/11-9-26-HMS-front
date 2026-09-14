import * as bwipjs from "bwip-js";

import { fitModule, mm, THERMAL_DPI } from "./sizing";

/**
 * Barcodes as inline SVG, sized in millimetres from the module count.
 *
 * Not a PNG scaled to fit: a raster barcode resampled by a print driver gets
 * bars of uneven width, and Code 128 is decoded from the ratio of bar widths.
 * An SVG whose viewBox is exactly N modules wide, drawn N × moduleMm wide, puts
 * every module at the same physical width, and that width is a whole number of
 * thermal-head dots (see `fitModule`).
 */

export interface RenderedSymbol {
  /** Markup this module built; safe to interpolate with `raw()`. */
  svg: string;
  widthMm: number;
  heightMm: number;
  moduleMm: number;
  /** Quiet zone on each side, which the caller must leave empty. */
  quietMm: number;
  modules: number;
  fits: boolean;
}

/**
 * ISO/IEC 15417 requires a 10-module quiet zone either side of a Code 128
 * symbol. Scanners find the start pattern by the silence before it; a label
 * edge or a line of text inside that silence is the commonest reason a
 * correctly printed symbol will not read.
 */
export const CODE128_QUIET_MODULES = 10;

/** ISO/IEC 16022 asks for one module; two survive a slightly misaligned label. */
export const DATAMATRIX_QUIET_MODULES = 2;

/*
 * Module counts are read off the SVG bwip-js draws, not from `bwipjs.raw()`.
 * `raw()` only works in the Node build — in the browser and React Native builds
 * it demands a canvas — and the SVG is what is actually printed, so measuring
 * it measures the right thing. The unit suite cross-checks these counts against
 * `raw()` under Node.
 */

function viewBox(svg: string) {
  const match = /^<svg viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
  if (!match) throw new Error("Unexpected barcode SVG from bwip-js");
  return { open: match[0], unitsWide: Number(match[1]), unitsHigh: Number(match[2]) };
}

function wholeModules(units: number, perModule: number, what: string): number {
  const modules = units / perModule;
  // Not whole modules means padding or text crept into the drawing, and every
  // mm below would be wrong. Fail loudly rather than print bars 3% too wide.
  if (!Number.isFinite(modules) || Math.abs(modules - Math.round(modules)) > 1e-6) {
    throw new Error(`Barcode SVG ${what} is ${units} units, not a whole number of ${perModule}-unit modules`);
  }
  return Math.round(modules);
}

/**
 * Code 128's narrowest stroke is one module. Every symbol has one: the stop
 * pattern (2-3-3-1-1-1-2) contains a single-module bar whatever the data.
 */
function code128UnitsPerModule(svg: string): number {
  const widths = [...svg.matchAll(/stroke-width="(\d+(?:\.\d+)?)"/g)].map((m) => Number(m[1]));
  if (widths.length === 0) throw new Error("Code 128 SVG has no bars");
  return Math.min(...widths);
}

/**
 * A DataMatrix is drawn as polygons on its module grid, and its timing pattern
 * alternates every module along two edges — so the greatest common divisor of
 * the coordinates is exactly one module.
 */
function matrixUnitsPerModule(svg: string): number {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const values = [...svg.matchAll(/ d="([^"]+)"/g)]
    .flatMap((m) => m[1].match(/\d+(?:\.\d+)?/g) ?? [])
    .map(Number)
    .filter((n) => n > 0);
  if (values.length === 0 || values.some((n) => !Number.isInteger(n))) {
    throw new Error("DataMatrix SVG is not drawn on a whole-unit grid");
  }
  return values.reduce(gcd);
}

/**
 * Stamps the physical size onto the SVG.
 *
 * preserveAspectRatio="none": a 1D symbol's bar HEIGHT is free and its WIDTH is
 * not, so the axes are sized independently. crispEdges stops the rasteriser
 * anti-aliasing a bar edge into a grey column.
 */
function sized(svg: string, open: string, widthMm: number, heightMm: number, label: string): string {
  const { unitsWide, unitsHigh } = viewBox(svg);
  return svg.replace(
    open,
    `<svg viewBox="0 0 ${unitsWide} ${unitsHigh}" width="${mm(widthMm)}" height="${mm(heightMm)}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="${label}"`,
  );
}

/** Code 128 of `text`, for generic scanners and analysers. Human-readable text is the caller's. */
export function code128(
  text: string,
  { heightMm, availableMm, maxDots, dpi = THERMAL_DPI }: { heightMm: number; availableMm: number; maxDots: number; dpi?: number },
): RenderedSymbol {
  const svg = bwipjs.toSVG({ bcid: "code128", text, scale: 1, height: 10, includetext: false, paddingwidth: 0, paddingheight: 0 });
  const box = viewBox(svg);
  const modules = wholeModules(box.unitsWide, code128UnitsPerModule(svg), "width");
  const fit = fitModule({ modules, quietModules: CODE128_QUIET_MODULES, availableMm, maxDots, dpi });
  return {
    svg: sized(svg, box.open, fit.symbolMm, heightMm, "Code 128 barcode"),
    widthMm: fit.symbolMm,
    heightMm,
    moduleMm: fit.moduleMm,
    quietMm: CODE128_QUIET_MODULES * fit.moduleMm,
    modules,
    fits: fit.fits,
  };
}

/**
 * DataMatrix of `text`, for the versioned payload.
 *
 * DataMatrix rather than QR: for a 20-character payload it is 18×18 modules
 * against QR's 21×21 plus a four-module quiet zone, which is the difference
 * between fitting across a 19 mm infant band at a readable module size and
 * not. Every scanner this app uses — phone cameras via expo-camera, ZXing in
 * the browser, 2D imagers on a ward — reads both.
 */
export function dataMatrix(
  text: string,
  { availableMm, maxDots, dpi = THERMAL_DPI }: { availableMm: number; maxDots: number; dpi?: number },
): RenderedSymbol {
  const svg = bwipjs.toSVG({ bcid: "datamatrix", text, scale: 1, paddingwidth: 0, paddingheight: 0 });
  const box = viewBox(svg);
  const perModule = matrixUnitsPerModule(svg);
  const modulesWide = wholeModules(box.unitsWide, perModule, "width");
  const modulesHigh = wholeModules(box.unitsHigh, perModule, "height");
  const modules = Math.max(modulesWide, modulesHigh);
  const fit = fitModule({ modules, quietModules: DATAMATRIX_QUIET_MODULES, availableMm, maxDots, dpi });
  const widthMm = modulesWide * fit.moduleMm;
  const heightMm = modulesHigh * fit.moduleMm;
  return {
    svg: sized(svg, box.open, widthMm, heightMm, "DataMatrix code"),
    widthMm,
    heightMm,
    moduleMm: fit.moduleMm,
    quietMm: DATAMATRIX_QUIET_MODULES * fit.moduleMm,
    modules,
    fits: fit.fits,
  };
}
