import React from "react";
import { View, StyleSheet } from "react-native";
import { ClipboardList } from "lucide-react-native";

import { palette, radius, type SignalLevel } from "@shared/designSystem";
import { SignalBadge, Text } from "@shared/ui";

/**
 * ESI 4 and 5 share the "normal" tier on purpose: both can safely wait, and a
 * board with five colours stops being read. 1–3 each get their own shape.
 */
const LEVEL_SIGNAL: Record<number, SignalLevel> = { 1: "critical", 2: "urgent", 3: "caution", 4: "normal", 5: "normal" };

export const UNTRIAGED_LABEL = "Triage now";

interface Props {
  level: number | null;
  /** "Resuscitation", "Urgent" … appended when there is room for it. */
  label?: string | null;
  size?: "sm" | "md";
  testID?: string;
}

export function EsiBadge({ level, label, size = "md", testID }: Props) {
  // Untriaged is not "low acuity" — it is unknown acuity, and it may be the
  // ESI 1. So it takes none of the signal colours, which would each claim an
  // answer, and is drawn solid dark so it reads as an instruction.
  if (!level) {
    return (
      <View
        testID={testID}
        accessibilityRole="text"
        accessibilityLabel="Not yet triaged. Triage now."
        style={[styles.untriaged, size === "sm" ? styles.sm : styles.md]}
      >
        <ClipboardList size={size === "sm" ? 12 : 14} color={palette.text.inverse} strokeWidth={2.2} />
        <Text variant={size === "sm" ? "label-sm" : "label"} weight="600" style={{ color: palette.text.inverse }}>
          {UNTRIAGED_LABEL}
        </Text>
      </View>
    );
  }

  return (
    <View testID={testID} style={styles.wrap}>
      <SignalBadge
        level={LEVEL_SIGNAL[level] ?? "normal"}
        label={label ? `ESI ${level} · ${label}` : `ESI ${level}`}
        size={size}
        // Solid for the two levels that must be acted on within minutes.
        solid={level <= 2}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "flex-start" },
  untriaged: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.ink[900],
    backgroundColor: palette.ink[900],
  },
  sm: { paddingHorizontal: 6, paddingVertical: 2 },
  md: { paddingHorizontal: 8, paddingVertical: 4 },
});
