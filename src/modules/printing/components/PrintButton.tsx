import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Printer } from "lucide-react-native";

import { palette } from "@shared/designSystem";
import { Button, HStack, Text, VStack } from "@shared/ui";
import { printDocument, type PrintJob } from "@shared/print/printDocument";
import {
  desktopBridge,
  getLabelPrinter,
  setLabelPrinter,
  type DesktopPrinter,
} from "@shared/print/desktopBridge";

interface Props {
  label: string;
  /** Builds the document at press time, from the data on screen then. */
  build: () => PrintJob | Promise<PrintJob>;
  printerClass: PrintJob["printerClass"];
  disabled?: boolean;
  /** Said under the button while it is disabled, so a greyed-out button is never a mystery. */
  disabledReason?: string;
  note?: string;
  align?: "flex-start" | "flex-end";
  testID?: string;
}

/**
 * Print action with a result message. After every web print it repeats the scale/margins
 * instruction, since browser scaling breaks label barcodes.
 */
export function PrintButton({
  label,
  build,
  printerClass,
  disabled,
  disabledReason,
  note,
  align = "flex-end",
  testID,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "tertiary"; text: string } | null>(null);

  const onPress = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const job = await build();
      const outcome = await printDocument(job);
      if (!outcome.ok) {
        setMessage({ tone: "danger", text: `Not printed${outcome.reason ? `: ${outcome.reason}` : ""}` });
      } else if (outcome.channel === "web") {
        setMessage({
          tone: "tertiary",
          text:
            job.printerClass === "label"
              ? `In the print dialog choose the label printer, set Scale to 100% and Margins to None. Anything else prints the ${job.widthMm} × ${job.heightMm} mm label at the wrong size, and its barcode may not scan.`
              : "In the print dialog set Scale to 100% and Margins to None, so the page prints at its real size.",
        });
      } else if (outcome.channel === "desktop") {
        setMessage({ tone: "tertiary", text: `Sent to ${outcome.deviceName || "the default printer"}` });
      }
    } catch (err) {
      setMessage({ tone: "danger", text: err instanceof Error ? err.message : "The document could not be prepared" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <VStack gap={4} style={{ alignItems: align, maxWidth: 360 }}>
      <Button
        label={label}
        variant="secondary"
        size="sm"
        fullWidth={false}
        loading={busy}
        disabled={disabled}
        onPress={onPress}
        testID={testID}
        icon={<Printer size={14} color={palette.text.primary} strokeWidth={2.2} />}
      />
      {disabled && disabledReason ? (
        <Text variant="caption" tone="tertiary" style={{ textAlign: align === "flex-end" ? "right" : "left" }}>
          {disabledReason}
        </Text>
      ) : null}
      {note ? (
        <Text variant="caption" tone="tertiary" style={{ textAlign: align === "flex-end" ? "right" : "left" }}>
          {note}
        </Text>
      ) : null}
      {message ? (
        <Text
          variant="caption"
          tone={message.tone}
          style={{ textAlign: align === "flex-end" ? "right" : "left" }}
          testID={testID ? `${testID}-message` : undefined}
        >
          {message.text}
        </Text>
      ) : null}
      {printerClass === "label" ? <LabelPrinterPicker align={align} /> : null}
    </VStack>
  );
}

/** Label printer picker; desktop shell only, as browsers cannot target a printer by name. */
function LabelPrinterPicker({ align }: { align: "flex-start" | "flex-end" }) {
  const bridge = desktopBridge();
  const [selected, setSelected] = useState<string | null>(() => getLabelPrinter());
  const [open, setOpen] = useState(false);
  const [printers, setPrinters] = useState<DesktopPrinter[] | null>(null);

  useEffect(() => {
    if (!bridge || !open) return;
    let live = true;
    Promise.resolve(bridge.listPrinters())
      .then((list) => live && setPrinters(list))
      .catch(() => live && setPrinters([]));
    return () => {
      live = false;
    };
  }, [bridge, open]);

  if (!bridge) return null;

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" hitSlop={8}>
        <Text variant="caption" tone="link">
          Label printer: {selected ?? "system default"} · Change
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={{ alignItems: align }}>
      {printers === null ? (
        <Text variant="caption" tone="tertiary">
          Looking for printers…
        </Text>
      ) : printers.length === 0 ? (
        <Text variant="caption" tone="danger">
          No printers found on this computer.
        </Text>
      ) : (
        <HStack gap={6} wrap justify={align}>
          {printers.map((p) => (
            <Button
              key={p.name}
              label={`${p.displayName || p.name}${p.isDefault ? " (default)" : ""}`}
              size="xs"
              variant={p.name === selected ? "primary" : "secondary"}
              fullWidth={false}
              onPress={() => {
                setLabelPrinter(p.name);
                setSelected(p.name);
                setOpen(false);
              }}
            />
          ))}
        </HStack>
      )}
    </View>
  );
}
