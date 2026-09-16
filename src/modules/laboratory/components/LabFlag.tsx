import React from "react";
import { View, StyleSheet } from "react-native";
import { palette, radius, signal, type SignalLevel } from "@shared/designSystem";
import { Text } from "@shared/ui";
import type { LabFlag as Flag, LabEntryParameter } from "@modules/laboratory/types";

/**
 * paper-report glyphs (L, H, LL, HH), so a flag survives greyscale printing and colour blindness.
 * `none` and `indeterminate` are drawn as something: blank would read as "within range".
 */
export interface FlagPresentation {
  glyph: string;
  label: string;
  level: SignalLevel | null;
}

export function flagPresentation(flag: Flag): FlagPresentation {
  switch (flag) {
    case "criticalLow":
      return { glyph: "LL", label: "Critically low", level: "critical" };
    case "criticalHigh":
      return { glyph: "HH", label: "Critically high", level: "critical" };
    case "critical":
      return { glyph: "!!", label: "Critical", level: "critical" };
    case "low":
      return { glyph: "L", label: "Low", level: "urgent" };
    case "high":
      return { glyph: "H", label: "High", level: "urgent" };
    case "abnormal":
      return { glyph: "A", label: "Abnormal", level: "urgent" };
    case "indeterminate":
      return { glyph: "?", label: "Cannot be flagged — check", level: "caution" };
    case "none":
      return { glyph: "–", label: "No range for this patient", level: null };
    default:
      return { glyph: "", label: "Within range", level: "normal" };
  }
}

export function LabFlagGlyph({ flag, testID }: { flag: Flag; testID?: string }) {
  const p = flagPresentation(flag);
  if (flag === "normal") return null;
  const s = p.level ? signal[p.level] : null;
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={p.label}
      style={[
        styles.glyph,
        s
          ? { backgroundColor: s.bg, borderColor: s.border }
          : { backgroundColor: palette.surface.sunken, borderColor: palette.border.default },
      ]}
    >
      <Text variant="label-sm" style={{ color: s ? s.text : palette.text.secondary }}>
        {p.glyph}
      </Text>
    </View>
  );
}

/**
 * flag previewed while typing, exact numbers only; the saved flag is always the server's.
 * a censored or unreadable value gets no preview rather than a guess.
 */
export function previewFlag(parameter: LabEntryParameter, text: string): Flag | "invalid" | null {
  const raw = text.trim();
  if (raw === "") return null;

  if (parameter.type !== "numeric") {
    const lower = raw.toLowerCase();
    if (parameter.criticalValues.some((v) => v.toLowerCase() === lower)) return "critical";
    if (parameter.abnormalValues.some((v) => v.toLowerCase() === lower)) return "abnormal";
    if (parameter.choices.length && !parameter.choices.some((v) => v.toLowerCase() === lower)) {
      return "invalid";
    }
    return parameter.choices.length ? "normal" : null;
  }

  if (/^[<>]=?/.test(raw)) return null;
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(raw)) return "invalid";
  const v = Number(raw);

  if (parameter.criticalLow !== null && v <= parameter.criticalLow) return "criticalLow";
  if (parameter.criticalHigh !== null && v >= parameter.criticalHigh) return "criticalHigh";
  const low = parameter.range?.low ?? null;
  const high = parameter.range?.high ?? null;
  if (low === null && high === null) return "none";
  if (low !== null && v < low) return "low";
  if (high !== null && v > high) return "high";
  return "normal";
}

const styles = StyleSheet.create({
  glyph: {
    minWidth: 26,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
