import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { palette, radius, layout } from "@shared/designSystem";
import { Text } from "@shared/ui";
import { checkable, webAria } from "@shared/ui/a11y";

interface Props {
  label: string;
  active: boolean;
  onPress: () => void;
  count?: number;
  /** Tints the count — a queue with something waiting in it. */
  accentColor?: string;
  /** "tab" for one-of-several choices, "switch" for an on/off filter. */
  role?: "tab" | "switch";
  testID?: string;
}

/**
 * A single ChipsRow-style chip with its own testID (ChipsRow cannot take one per chip).
 * A "tab" chip must sit inside a Stack with role="tablist".
 */
export function FilterChip({
  label,
  active,
  onPress,
  count,
  accentColor,
  role = "tab",
  testID,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={
        role === "switch" ? { checked: active } : { selected: active }
      }
      {...(role === "switch"
        ? checkable(active, onPress)
        : webAria({ selected: active }))}
      accessibilityLabel={count !== undefined ? `${label}, ${count}` : label}
      testID={testID}
      style={[
        styles.chip,
        active && styles.chipActive,
        accentColor && !active ? { borderColor: accentColor } : null,
      ]}
    >
      <Text
        variant="label"
        weight={active ? "600" : "500"}
        style={{
          color: active ? palette.clinical[700] : palette.text.secondary,
        }}
      >
        {label}
      </Text>
      {count !== undefined ? (
        <View
          style={[
            styles.count,
            {
              backgroundColor:
                accentColor ??
                (active ? palette.clinical[100] : palette.ink[100]),
            },
          ]}
        >
          <Text
            variant="label-sm"
            weight="600"
            tabular
            style={{
              color: accentColor
                ? "#FFFFFF"
                : active
                  ? palette.clinical[700]
                  : palette.text.secondary,
            }}
          >
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: layout.chipHeight,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.primary,
  },
  chipActive: {
    borderColor: palette.clinical[400],
    backgroundColor: palette.clinical[50],
  },
  count: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.full,
    alignItems: "center",
  },
});
