/**
 * The Electron shell's print bridge, when the app is running inside it.
 *
 * Exists because a browser cannot be made to print at an exact size: its print
 * dialog owns scaling and margins, and "Fit to page" on a 25 mm wristband
 * produces a band whose barcode no longer scans. The desktop shell prints the
 * same HTML with `webContents.print` at a fixed page size, silently, to a named
 * printer.
 */

export interface DesktopPrinter {
  name: string;
  displayName: string;
  isDefault: boolean;
}

export interface DesktopPrintResult {
  ok: boolean;
  reason?: string;
  deviceName?: string;
}

export interface HmsDesktopBridge {
  printExact: (job: {
    html: string;
    widthMm: number;
    heightMm: number;
    deviceName?: string;
  }) => Promise<DesktopPrintResult>;
  listPrinters: () => DesktopPrinter[] | Promise<DesktopPrinter[]>;
}

export function desktopBridge(): HmsDesktopBridge | null {
  const w = globalThis as unknown as { hmsDesktop?: Partial<HmsDesktopBridge> };
  const bridge = w.hmsDesktop;
  return bridge && typeof bridge.printExact === "function" && typeof bridge.listPrinters === "function"
    ? (bridge as HmsDesktopBridge)
    : null;
}

/**
 * The label printer this workstation prints wristbands and tube labels to.
 *
 * Per device, in localStorage, deliberately not per user: the Zebra is bolted
 * to the ward desk, and a nurse logging in at a different desk must print to
 * THAT desk's printer rather than to the one where they last worked. A label
 * printed to the wrong room is a label someone else picks up.
 */
const LABEL_PRINTER_KEY = "hms.print.labelPrinter";

export function getLabelPrinter(): string | null {
  try {
    return globalThis.localStorage?.getItem(LABEL_PRINTER_KEY) || null;
  } catch {
    return null;
  }
}

export function setLabelPrinter(name: string | null): void {
  try {
    if (name) globalThis.localStorage?.setItem(LABEL_PRINTER_KEY, name);
    else globalThis.localStorage?.removeItem(LABEL_PRINTER_KEY);
  } catch {
    /* private window or quota — the choice just will not persist */
  }
}
