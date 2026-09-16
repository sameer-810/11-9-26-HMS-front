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
  /** Labels go to the chosen label printer; pages go to the system default. */
  printerClass: "label" | "page";
}

export interface PrintOutcome {
  ok: boolean;
  channel: "desktop" | "web" | "native" | "test";
  reason?: string;
  deviceName?: string;
}

/**
 * Set only by tools/verifyPrinting.mjs: records the job on `__hmsLastPrint` instead of
 * printing, so the gate can measure it. Production never sets the flag.
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

  // Desktop first: its shell also reports Platform.OS "web", and only it guarantees exact size.
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
 * Web: print from a hidden iframe so the app layout is not printed. Browsers honour
 * `@page` size but not scale, so users must set 100% scale and no margins.
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
      // Some browsers fire afterprint when the dialog opens; delay removal until spooled.
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

    // No allow-scripts: a srcdoc frame is same-origin, so injected script could reach the session.
    // allow-same-origin lets this code call print(); allow-modals stops print() being ignored.
    frame.setAttribute("sandbox", "allow-same-origin allow-modals");
    frame.srcdoc = job.html;
    document.body.appendChild(frame);
  });
}
