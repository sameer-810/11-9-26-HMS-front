import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import {
  OctagonAlert,
  TriangleAlert,
  Info,
  CircleCheck,
  type LucideIcon,
} from "lucide-react-native";
import { signal, radius, type SignalLevel } from "../designSystem";
import { Text } from "./Text";


/**
 * Clinical signal badge. Each level has a distinct icon shape so meaning survives greyscale and
 * colour blindness. No `color` prop on purpose; use a Chip for custom colours.
 */
const ICONS: Record<SignalLevel, LucideIcon> = {
  critical: OctagonAlert,
  urgent: TriangleAlert,
  caution: Info,
  normal: CircleCheck,
};

interface Props {
  level: SignalLevel;
  /** Defaults to the level's own label — "Critical", "Urgent", … */
  label?: string;
  size?: "sm" | "md";
  showIcon?: boolean;
  /** Solid fill instead of tinted. For a badge sitting on a coloured surface. */
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SignalBadge({
  level,
  label,
  size = "md",
  showIcon = true,
  solid = false,
  style,
}: Props) {
  const s = signal[level];
  const Icon = ICONS[level];
  const text = label ?? s.label;
  const iconSize = size === "sm" ? 12 : 14;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${s.label}: ${text}`}
      style={[
        styles.base,
        size === "sm" ? styles.sm : styles.md,
        {
          backgroundColor: solid ? s.color : s.bg,
          borderColor: solid ? s.color : s.border,
        },
        style,
      ]}
    >
      {showIcon ? (
        <Icon size={iconSize} color={solid ? s.onColor : s.text} strokeWidth={2.2} />
      ) : null}
      <Text
        variant={size === "sm" ? "label-sm" : "label"}
        weight="600"
        style={{ color: solid ? s.onColor : s.text }}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  sm: { paddingHorizontal: 6, paddingVertical: 2 },
  md: { paddingHorizontal: 8, paddingVertical: 4 },
});
