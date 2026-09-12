import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { palette, radius, bedState } from "../designSystem";
import { Text } from "./Text";

/**
 * Workflow state — the state machines from the spec, not clinical severity.
 *
 * Kept apart from SignalBadge on purpose. "In consultation" and "critically
 * high potassium" must not look like the same kind of thing, so state chips are
 * quiet and neutral by default and only the genuinely attention-worthy states
 * borrow a warm colour.
 */

type Palette = { bg: string; text: string; border: string };

const NEUTRAL: Palette = {
  bg: palette.surface.tertiary,
  text: palette.text.secondary,
  border: palette.border.default,
};
const BLUE: Palette = { bg: palette.info.bg, text: palette.info.text, border: palette.info.border };
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

/**
 * Every state in the spec's state tables, mapped once.
 *
 * A screen that invents its own colour for "Dispensed" is how two screens end
 * up disagreeing about what green means, so screens pass the state string and
 * this table decides.
 */
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
  const key = String(status || "").toLowerCase().trim();
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
    <View style={[styles.base, styles.md, { backgroundColor: c.bg, borderColor: c.border }]}>
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
