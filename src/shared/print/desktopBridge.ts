/**
 * Electron shell print bridge: exact-size silent printing, which browsers cannot do
 * (dialog scaling breaks wristband barcodes).
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
  return bridge &&
    typeof bridge.printExact === "function" &&
    typeof bridge.listPrinters === "function"
    ? (bridge as HmsDesktopBridge)
    : null;
}

/**
 * This workstation's label printer. Stored per device, not per user, so labels print at the
 * desk the nurse is actually at.
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
