import React from "react";
import { View, StyleSheet } from "react-native";
import { palette, radius, signal, type SignalLevel } from "@shared/designSystem";
import { Text } from "@shared/ui";
import type { LabFlag as Flag, LabEntryParameter } from "@modules/laboratory/types";

/**
 * How a laboratory flag is drawn.
 *
 * The glyphs are the ones a clinician reads off a paper report — L, H, LL, HH —
 * so the flag survives greyscale printing and colour vision deficiency, and so
 * nobody has to learn a new visual language to read a potassium.
 *
 * Two flags that are NOT normal are drawn as something, never as nothing:
 *  - `none`: no reference range applies to this patient. Drawing it blank reads
 *    as "within range".
 *  - `indeterminate`: a censored value ("<5") that could be normal or critical.
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
 * A flag previewed while the value is typed.
 *
 * Exact numbers only, against the range the server sent for this patient. The
 * SAVED flag is always the server's — this exists so a technician typing "6.9"
 * into a potassium sees it turn critical before pressing save, not after.
 * A censored or unreadable value gets no preview rather than a guess.
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
