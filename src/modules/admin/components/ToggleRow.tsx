import React from "react";
import { Pressable, View, StyleSheet } from "react-native";
import { Check, Lock } from "lucide-react-native";

import { palette, radius, layout } from "@shared/designSystem";
import { Text, VStack } from "@shared/ui";

interface Props {
  label: string;
  description?: string;
  /** Short qualifier drawn under the label — "Clinical", "You do not hold this". */
  note?: string;
  noteTone?: "tertiary" | "warning" | "danger";
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Locked rows stay visible, with the reason, rather than disappearing. */
  disabled?: boolean;
  testID?: string;
}

/**
 * A labelled checkbox.
 *
 * A row rather than a bare switch because every place this is used — the
 * permission editor, bed equipment, the clinical flag — needs the consequence
 * spelled out beside the control. An unlabelled toggle next to "record.view" is
 * how access gets granted by someone who did not know what it exposed.
 */
export function ToggleRow({
  label,
  description,
  note,
  noteTone = "tertiary",
  checked,
  onChange,
  disabled,
  testID,
}: Props) {
  return (
    <Pressable
      onPress={() => !disabled && onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      testID={testID}
      style={({ pressed }) => [styles.row, pressed && !disabled ? styles.pressed : null]}
    >
      <View
        style={[
          styles.box,
          checked ? styles.boxOn : null,
          disabled ? { opacity: 0.55 } : null,
        ]}
      >
        {checked ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
      <VStack gap={1} flex={1}>
        <Text variant="label" tone={disabled ? "tertiary" : "primary"}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" tone="tertiary">
            {description}
          </Text>
        ) : null}
        {note ? (
          <Text variant="caption" tone={noteTone}>
            {note}
          </Text>
        ) : null}
      </VStack>
      {disabled ? <Lock size={14} color={palette.text.tertiary} strokeWidth={2} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    minHeight: layout.minTouchTarget,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: radius.md,
  },
  pressed: { backgroundColor: palette.surface.secondary },
  box: {
    width: 20,
    height: 20,
    marginTop: 1,
    borderRadius: radius.xs,
    borderWidth: 1.5,
    borderColor: palette.border.strong,
    backgroundColor: palette.surface.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { borderColor: palette.clinical[700], backgroundColor: palette.clinical[700] },
});
