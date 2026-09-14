import { Platform } from "react-native";
import * as Print from "expo-print";

import { mmToPt } from "./sizing";
import { desktopBridge, getLabelPrinter } from "./desktopBridge";

export interface PrintJob {
  /** A complete document from `pageDocument`. */
  html: string;
  widthMm: number;
  heightMm: number;
  title: string;
  /**
   * Labels go to the workstation's chosen label printer; pages go to the
   * system default. A wristband sent to the A4 laser is wasted, and an A4
   * report sent to a 50 mm label roll is 40 wasted labels.
   */
  printerClass: "label" | "page";
}

export interface PrintOutcome {
  ok: boolean;
  channel: "desktop" | "web" | "native" | "test";
  reason?: string;
  deviceName?: string;
}

/**
 * The browser gate's view of a print.
 *
 * When `globalThis.__HMS_TEST_PRINT__` is set — only `tools/verifyPrinting.mjs`
 * sets it, via `page.addInitScript` before the app loads — the job is recorded
 * on `window.__hmsLastPrint` and NOT sent to a printer. A headless browser has
 * no print dialog to dismiss, and the gate needs the exact HTML and page size
 * that would have been printed so it can render it to PDF and measure it.
 * Nothing in the app sets the flag, so production never takes this branch.
 */
interface TestPrintGlobals {
  __HMS_TEST_PRINT__?: unknown;
  __hmsLastPrint?: { html: string; widthMm: number; heightMm: number; title: string };
}

export async function printDocument(job: PrintJob): Promise<PrintOutcome> {
  const testGlobals = globalThis as unknown as TestPrintGlobals;
  if (testGlobals.__HMS_TEST_PRINT__) {
    testGlobals.__hmsLastPrint = {
      html: job.html,
      widthMm: job.widthMm,
      heightMm: job.heightMm,
      title: job.title,
    };
    return { ok: true, channel: "test" };
  }

  // Desktop first: the shell runs the web build, so Platform.OS is "web" there
  // too, and it is the one place an exact size can actually be guaranteed.
  const bridge = desktopBridge();
  if (bridge) {
    const deviceName = job.printerClass === "label" ? getLabelPrinter() ?? undefined : undefined;
    try {
      const result = await bridge.printExact({
        html: job.html,
        widthMm: job.widthMm,
        heightMm: job.heightMm,
        deviceName,
      });
      return { ...result, channel: "desktop" };
    } catch (err) {
      return { ok: false, channel: "desktop", reason: err instanceof Error ? err.message : String(err) };
    }
  }

  if (Platform.OS === "web") return printInHiddenFrame(job);

  // iOS and Android: expo-print sizes the page in points (1/72 inch).
  try {
    await Print.printAsync({ html: job.html, width: mmToPt(job.widthMm), height: mmToPt(job.heightMm) });
    return { ok: true, channel: "native" };
  } catch (err) {
    return { ok: false, channel: "native", reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Web: print the document from a hidden iframe.
 *
 * An iframe rather than `window.print()` on the app, because the app's own
 * layout — sidebar, banner, scroll containers — would otherwise be what gets
 * printed. The frame's document carries `@page { size: W H; margin: 0 }` and
 * mm-exact CSS, which Chromium and Firefox honour as the paper size.
 *
 * They do NOT honour it as the scale. The print dialog's "Scale" and "Margins"
 * settings are the user's, and a browser left on "Fit to printable area" will
 * shrink a 25 × 280 mm band to whatever the driver reports as printable. The
 * caller therefore tells the user to set scale 100% and margins none; the
 * desktop path above exists because that instruction is not a guarantee.
 */
function printInHiddenFrame(job: PrintJob): Promise<PrintOutcome> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve({ ok: false, channel: "web", reason: "No document to print from" });
      return;
    }

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("tabindex", "-1");
    frame.title = job.title;
    Object.assign(frame.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "0",
      height: "0",
      border: "0",
      visibility: "hidden",
    });

    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      frame.remove();
    };

    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        remove();
        resolve({ ok: false, channel: "web", reason: "The print frame did not open" });
        return;
      }
      // Some browsers fire afterprint as the dialog OPENS rather than closes;
      // the delay keeps the document alive until the spooler has it.
      win.addEventListener("afterprint", () => setTimeout(remove, 1000), { once: true });
      setTimeout(remove, 120_000);
      try {
        win.focus();
        win.print();
        resolve({ ok: true, channel: "web" });
      } catch (err) {
        remove();
        resolve({ ok: false, channel: "web", reason: err instanceof Error ? err.message : String(err) });
      }
    };

    frame.srcdoc = job.html;
    document.body.appendChild(frame);
  });
}
