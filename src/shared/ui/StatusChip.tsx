import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { palette, radius, bedState } from "../designSystem";
import { Text } from "./Text";

/** Workflow state chip, not clinical severity (see SignalBadge); neutral unless attention is needed. */
type Palette = { bg: string; text: string; border: string };

const NEUTRAL: Palette = {
  bg: palette.surface.tertiary,
  text: palette.text.secondary,
  border: palette.border.default,
};
const BLUE: Palette = {
  bg: palette.info.bg,
  text: palette.info.text,
  border: palette.info.border,
};
const GREEN: Palette = {
  bg: palette.success.bg,
  text: palette.success.text,
  border: palette.success.border,
};
const AMBER: Palette = {
  bg: palette.warning.bg,
  text: palette.warning.text,
  border: palette.warning.border,
};
const RED: Palette = {
  bg: palette.danger.bg,
  text: palette.danger.text,
  border: palette.danger.border,
};

/** Every spec state mapped once; screens pass the state string rather than choosing colours. */
const STATE_COLORS: Record<string, Palette> = {
  // Patient
  registered: NEUTRAL,
  scheduled: BLUE,
  arrived: AMBER,
  "in consultation": BLUE,
  admitted: BLUE,
  discharged: GREEN,
  cancelled: NEUTRAL,
  "no show": NEUTRAL,

  // Bed
  available: GREEN,
  occupied: BLUE,
  reserved: AMBER,
  "under maintenance": NEUTRAL,

  // Lab test
  requested: NEUTRAL,
  "sample collected": BLUE,
  "in progress": BLUE,
  completed: GREEN,
  reported: GREEN,
  rejected: RED,

  // Prescription
  created: NEUTRAL,
  "pending dispensing": AMBER,
  "partially dispensed": AMBER,
  dispensed: GREEN,

  // Bill
  draft: NEUTRAL,
  finalised: BLUE,
  finalized: BLUE,
  "partially paid": AMBER,
  paid: GREEN,
  overdue: RED,

  // Stock
  "in stock": GREEN,
  "low stock": AMBER,
  "out of stock": RED,
  expired: RED,

  // Account
  active: GREEN,
  inactive: NEUTRAL,
  pending: AMBER,
};

interface Props {
  status: string;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
}

export function StatusChip({ status, size = "md", style }: Props) {
  const key = String(status || "")
    .toLowerCase()
    .trim();
  const c = STATE_COLORS[key] ?? NEUTRAL;
  const label = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <View
      style={[
        styles.base,
        size === "sm" ? styles.sm : styles.md,
        { backgroundColor: c.bg, borderColor: c.border },
        style,
      ]}
    >
      <Text
        variant={size === "sm" ? "label-sm" : "label"}
        weight="500"
        style={{ color: c.text }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

/** Bed status, which has its own token set on the design system. */
export function BedStatusChip({ state }: { state: keyof typeof bedState }) {
  const c = bedState[state];
  return (
    <View
      style={[
        styles.base,
        styles.md,
        { backgroundColor: c.bg, borderColor: c.border },
      ]}
    >
      <Text variant="label" weight="500" style={{ color: c.color }}>
        {c.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.sm, borderWidth: 1, alignSelf: "flex-start" },
  sm: { paddingHorizontal: 6, paddingVertical: 1 },
  md: { paddingHorizontal: 8, paddingVertical: 3 },
});
