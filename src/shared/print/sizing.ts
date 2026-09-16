/**
 * Print sizing in millimetres (labels and paper are specified in mm, not pixels).
 * Pure: no React Native or DOM, so it is unit-tested directly.
 */

export const MM_PER_INCH = 25.4;
export const POINTS_PER_INCH = 72;

/** Target thermal head: 203 dpi, the common label printer resolution. Sizes also work at 300 dpi. */
export const THERMAL_DPI = 203;

/** Narrowest printable bar: two dots at 203 dpi. One-dot bars bleed or drop out on thermal stock. */
export const MIN_NARROW_BAR_MM = 0.25;

/** Points, the unit `expo-print` sizes a page in (1 pt = 1/72 inch). */
export function mmToPt(mm: number): number {
  return (mm * POINTS_PER_INCH) / MM_PER_INCH;
}

export function ptToMm(pt: number): number {
  return (pt * MM_PER_INCH) / POINTS_PER_INCH;
}

/** One printer dot, in mm. */
export function dotMm(dpi: number = THERMAL_DPI): number {
  return MM_PER_INCH / dpi;
}

export interface ModuleFit {
  /** False when even the narrowest permitted module does not fit. */
  fits: boolean;
  /** Whole printer dots per module. */
  dots: number;
  moduleMm: number;
  /** The bars (or matrix) alone. */
  symbolMm: number;
  /** Including the quiet zone on both sides. */
  totalMm: number;
}

/**
 * Largest module that fits (capped at `maxDots`), in WHOLE printer dots.
 * Fractional dots print unevenly and break Code 128's bar-width ratios.
 */
export function fitModule({
  modules,
  quietModules,
  availableMm,
  maxDots,
  minMm = MIN_NARROW_BAR_MM,
  dpi = THERMAL_DPI,
}: {
  /** Modules in the symbol itself. */
  modules: number;
  /** Quiet-zone modules required on EACH side. */
  quietModules: number;
  availableMm: number;
  maxDots: number;
  minMm?: number;
  dpi?: number;
}): ModuleFit {
  const dot = dotMm(dpi);
  // The epsilon keeps 0.25 / 0.12512 = 1.998… from becoming 1 dot.
  const minDots = Math.max(1, Math.ceil(minMm / dot - 1e-6));
  const span = modules + 2 * quietModules;
  const largest = Math.floor(availableMm / (span * dot) + 1e-9);
  const fits = largest >= minDots;
  const dots = fits ? Math.max(minDots, Math.min(maxDots, largest)) : minDots;
  return {
    fits,
    dots,
    moduleMm: dots * dot,
    symbolMm: modules * dots * dot,
    totalMm: span * dots * dot,
  };
}

/** Rounded to four places for CSS, far below one dot. */
export function mm(value: number): string {
  return `${Number(value.toFixed(4))}mm`;
}
