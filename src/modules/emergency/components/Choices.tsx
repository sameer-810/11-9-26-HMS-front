import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Square, SquareCheck } from "lucide-react-native";

import { palette, radius, layout } from "@shared/designSystem";
import { Text, VStack, HStack } from "@shared/ui";
import { checkable } from "@shared/ui/a11y";

/**
 * Selectable chips with a testID on each chip.
 *
 * The shared ChipsRow is a filter bar — one horizontally-scrolling row, no
 * per-chip ids. Triage and registration need wrapping chips, multi-select for
 * resources, and a stable handle on each choice for the end-to-end suite.
 */
export function ChoiceChips({
  options,
  isSelected,
  onPress,
  testIDPrefix,
  multi = false,
  disabled = false,
}: {
  options: { key: string; label: string; icon?: React.ReactNode }[];
  isSelected: (key: string) => boolean;
  onPress: (key: string) => void;
  testIDPrefix: string;
  multi?: boolean;
  disabled?: boolean;
}) {
  return (
    <HStack gap={8} wrap>
      {options.map((o) => {
        const selected = isSelected(o.key);
        return (
          <Pressable
            key={o.key}
            onPress={() => onPress(o.key)}
            disabled={disabled}
            testID={`${testIDPrefix}-${o.key}`}
            accessibilityRole={multi ? "checkbox" : "radio"}
            accessibilityState={{ checked: selected, disabled }}
            {...checkable(selected, () => onPress(o.key), disabled)}
            accessibilityLabel={o.label}
            style={[styles.chip, selected && styles.chipActive, disabled && { opacity: 0.55 }]}
          >
            {o.icon}
            <Text
              variant="label"
              weight={selected ? "600" : "500"}
              style={{ color: selected ? palette.clinical[700] : palette.text.secondary }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </HStack>
  );
}

/** A checkbox-style row. Used where a flag is a statement, not a choice between options. */
export function CheckToggle({
  label,
  hint,
  value,
  onChange,
  testID,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID: string;
}) {
  const Icon = value ? SquareCheck : Square;
  return (
    <Pressable
      onPress={() => onChange(!value)}
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      {...checkable(value, () => onChange(!value))}
      accessibilityLabel={label}
      style={styles.check}
    >
      <Icon size={20} color={value ? palette.clinical[700] : palette.text.tertiary} strokeWidth={2} />
      <VStack gap={1} flex={1}>
        <Text variant="label-lg" tone="primary">
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" tone="tertiary">
            {hint}
          </Text>
        ) : null}
      </VStack>
    </Pressable>
  );
}

/**
 * One ESI question. Yes and No are both explicit buttons rather than a switch,
 * because "not toggled" and "answered no" look identical on a switch.
 */
export function YesNo({
  question,
  hint,
  value,
  onChange,
  testIDPrefix,
}: {
  question: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testIDPrefix: string;
}) {
  return (
    <HStack gap={12} align="center" wrap>
      <VStack gap={2} flex={1} style={{ minWidth: 220 }}>
        <Text variant="label-lg" tone="primary">
          {question}
        </Text>
        {hint ? (
          <Text variant="caption" tone="tertiary">
            {hint}
          </Text>
        ) : null}
      </VStack>
      <View>
        <ChoiceChips
          options={[
            { key: "yes", label: "Yes" },
            { key: "no", label: "No" },
          ]}
          isSelected={(k) => (k === "yes" ? value : !value)}
          onPress={(k) => onChange(k === "yes")}
          testIDPrefix={testIDPrefix}
        />
      </View>
    </HStack>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: layout.chipHeight + 4,
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
  check: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: layout.minTouchTarget,
  },
});
