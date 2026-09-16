import React from "react";
import { ScrollView, Pressable, StyleSheet, View } from "react-native";
import { palette, radius, layout } from "../designSystem";
import { Text } from "./Text";
import { webAria } from "./a11y";

export interface Chip {
  key: string;
  label: string;
  count?: number;
  /** Tints the chip — a queue with something urgent in it. */
  accentColor?: string;
}

interface Props {
  chips: Chip[];
  active: string;
  onChange: (key: string) => void;
}

export function ChipsRow({ chips, active, onChange }: Props) {
  return (
    // A tab is only a tab inside a tablist; without the parent a screen reader
    // announces orphaned tabs with no count and no "1 of 4".
    <ScrollView
      horizontal
      accessibilityRole="tablist"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {chips.map((c) => {
        const isActive = c.key === active;
        return (
          <Pressable
            key={c.key}
            onPress={() => onChange(c.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            {...webAria({ selected: isActive })}
            accessibilityLabel={
              c.count !== undefined ? `${c.label}, ${c.count}` : c.label
            }
            style={[
              styles.chip,
              isActive && styles.chipActive,
              c.accentColor && !isActive
                ? { borderColor: c.accentColor }
                : null,
            ]}
          >
            <Text
              variant="label"
              weight={isActive ? "600" : "500"}
              style={{
                color: isActive
                  ? palette.clinical[700]
                  : palette.text.secondary,
              }}
            >
              {c.label}
            </Text>
            {c.count !== undefined ? (
              <View
                style={[
                  styles.count,
                  {
                    backgroundColor:
                      c.accentColor ??
                      (isActive ? palette.clinical[100] : palette.ink[100]),
                  },
                ]}
              >
                <Text
                  variant="label-sm"
                  weight="600"
                  tabular
                  style={{
                    color: c.accentColor
                      ? "#FFFFFF"
                      : isActive
                        ? palette.clinical[700]
                        : palette.text.secondary,
                  }}
                >
                  {c.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
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
