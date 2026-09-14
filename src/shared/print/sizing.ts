/**
 * Physical sizes, in millimetres, and the arithmetic that keeps them physical.
 *
 * Everything printed in this app is specified in mm, because the things it is
 * printed on — wristband stock, tube labels, A5 and A4 — are specified in mm.
 * Pixels are the unit of the screen the document was designed on, and a label
 * designed in pixels comes out whatever size the driver guesses.
 *
 * Pure: no React Native, no DOM, so it is unit-tested directly.
 */

export const MM_PER_INCH = 25.4;
export const POINTS_PER_INCH = 72;

/**
 * The thermal head this sizing targets. 203 dpi (8 dots/mm) is the resolution
 * of practically every desktop wristband and specimen-label printer a hospital
 * buys — Zebra HC100 / ZD410 / ZD621, Brother TD-4 series, Honeywell PC42. A
 * 300 dpi head divides the same modules more finely, so what is right at 203
 * is right there too; the reverse is not true.
 */
export const THERMAL_DPI = 203;

/**
 * The narrowest bar we will print. At 203 dpi that is two dots (0.2502 mm).
 *
 * One dot is physically printable and practically unreadable: a single burnt
 * dot bleeds on direct-thermal stock, a worn head drops it entirely, and a
 * wristband is scanned through a plastic sleeve, curved round a wrist, in a
 * dim room at 3am. The scanners on a ward are set up for ≥ 10 mil (0.254 mm)
 * symbols; 0.25 mm is the floor, not the target.
 */
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
 * The module size for a symbol, as a WHOLE number of printer dots.
 *
 * Why whole dots rather than "scale it to the space": a module of 2.4 dots is
 * printed as 2 dots in some places and 3 in others, depending on where it falls
 * against the head's dot grid. The bars and spaces then no longer share one
 * width ratio, and Code 128 decodes by ratio — a symbol that looks perfect on
 * screen fails at the bedside. Snapping to dots keeps every module identical.
 *
 * Takes the largest module that fits, capped at `maxDots`: bigger reads from
 * further away and through a creased sleeve, but a band is also only so long.
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

/** Rounded for CSS. Four places is a tenth of a micron — well below a dot. */
export function mm(value: number): string {
  return `${Number(value.toFixed(4))}mm`;
}
