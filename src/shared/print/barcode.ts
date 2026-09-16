import * as bwipjs from "bwip-js";

import { fitModule, mm, THERMAL_DPI } from "./sizing";

/**
 * Barcodes as inline SVG sized in mm from the module count. SVG, not PNG: driver
 * resampling makes bar widths uneven, and each module must be whole thermal dots.
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

/** ISO/IEC 15417 quiet zone each side; anything printed inside it stops scans. */
export const CODE128_QUIET_MODULES = 10;

/** ISO/IEC 16022 asks for one module; two survive a slightly misaligned label. */
export const DATAMATRIX_QUIET_MODULES = 2;

// Module counts come from the drawn SVG: `bwipjs.raw()` needs a canvas outside Node.
function viewBox(svg: string) {
  const match = /^<svg viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
  if (!match) throw new Error("Unexpected barcode SVG from bwip-js");
  return {
    open: match[0],
    unitsWide: Number(match[1]),
    unitsHigh: Number(match[2]),
  };
}

function wholeModules(units: number, perModule: number, what: string): number {
  const modules = units / perModule;
  // Non-whole modules mean padding or text crept in; fail rather than print wrong widths.
  if (
    !Number.isFinite(modules) ||
    Math.abs(modules - Math.round(modules)) > 1e-6
  ) {
    throw new Error(
      `Barcode SVG ${what} is ${units} units, not a whole number of ${perModule}-unit modules`,
    );
  }
  return Math.round(modules);
}

/** Narrowest stroke is one module; the stop pattern always contains one. */
function code128UnitsPerModule(svg: string): number {
  const widths = [...svg.matchAll(/stroke-width="(\d+(?:\.\d+)?)"/g)].map((m) =>
    Number(m[1]),
  );
  if (widths.length === 0) throw new Error("Code 128 SVG has no bars");
  return Math.min(...widths);
}

/** The timing pattern alternates every module, so the GCD of coordinates is one module. */
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
 * Stamps physical size onto the SVG. Axes are sized independently (bar height is free);
 * crispEdges stops anti-aliased grey bar edges.
 */
function sized(
  svg: string,
  open: string,
  widthMm: number,
  heightMm: number,
  label: string,
): string {
  const { unitsWide, unitsHigh } = viewBox(svg);
  return svg.replace(
    open,
    `<svg viewBox="0 0 ${unitsWide} ${unitsHigh}" width="${mm(widthMm)}" height="${mm(heightMm)}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="${label}"`,
  );
}

/** Code 128 of `text`, for generic scanners and analysers. Human-readable text is the caller's. */
export function code128(
  text: string,
  {
    heightMm,
    availableMm,
    maxDots,
    dpi = THERMAL_DPI,
  }: { heightMm: number; availableMm: number; maxDots: number; dpi?: number },
): RenderedSymbol {
  const svg = bwipjs.toSVG({
    bcid: "code128",
    text,
    scale: 1,
    height: 10,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
  });
  const box = viewBox(svg);
  const modules = wholeModules(
    box.unitsWide,
    code128UnitsPerModule(svg),
    "width",
  );
  const fit = fitModule({
    modules,
    quietModules: CODE128_QUIET_MODULES,
    availableMm,
    maxDots,
    dpi,
  });
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
 * DataMatrix of `text`, for the versioned payload. Chosen over QR because it is
 * smaller and still fits a 19 mm infant band at a readable module size.
 */
export function dataMatrix(
  text: string,
  {
    availableMm,
    maxDots,
    dpi = THERMAL_DPI,
  }: { availableMm: number; maxDots: number; dpi?: number },
): RenderedSymbol {
  const svg = bwipjs.toSVG({
    bcid: "datamatrix",
    text,
    scale: 1,
    paddingwidth: 0,
    paddingheight: 0,
  });
  const box = viewBox(svg);
  const perModule = matrixUnitsPerModule(svg);
  const modulesWide = wholeModules(box.unitsWide, perModule, "width");
  const modulesHigh = wholeModules(box.unitsHigh, perModule, "height");
  const modules = Math.max(modulesWide, modulesHigh);
  const fit = fitModule({
    modules,
    quietModules: DATAMATRIX_QUIET_MODULES,
    availableMm,
    maxDots,
    dpi,
  });
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
