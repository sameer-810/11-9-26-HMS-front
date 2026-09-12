import React, { useState } from "react";
import { Pressable, Modal, ScrollView, StyleSheet } from "react-native";
import { ChevronDown, Check } from "lucide-react-native";
import { palette, radius, shadows } from "../designSystem";
import { Text } from "./Text";
import { HStack, VStack } from "./Stack";
import { useControlHeight } from "./useBreakpoint";

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
  /** Why it cannot be chosen — "Bed occupied", "Batch expired". */
  disabledReason?: string;
}

interface Props {
  label?: string;
  value?: string | null;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
}

/**
 * A disabled option is shown, not hidden.
 *
 * This matters in this application specifically. When a doctor cannot pick bed
 * 12, the useful answer is "bed 12 is occupied", not a list with bed 12 quietly
 * missing — the second makes the user hunt for something they can see on the
 * ward. Same for an expired batch in the dispensing screen.
 */
export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = "Select",
  error,
  hint,
  required,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const height = useControlHeight();
  const selected = options.find((o) => o.value === value);

  return (
    <VStack gap={5}>
      {label ? (
        <HStack gap={3} align="center">
          <Text variant="label" tone="secondary">
            {label}
          </Text>
          {required ? (
            <Text variant="label" style={{ color: palette.danger.text }}>
              *
            </Text>
          ) : null}
        </HStack>
      ) : null}

      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}. ${selected?.label ?? placeholder}` : placeholder}
        accessibilityState={{ disabled: Boolean(disabled), expanded: open }}
        style={[
          styles.control,
          {
            minHeight: height,
            borderColor: error ? palette.danger.text : palette.border.default,
            borderWidth: error ? 2 : 1,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        <Text
          variant="body"
          tone={selected ? "primary" : "disabled"}
          numberOfLines={1}
          style={{ flex: 1 }}
        >
          {selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={16} color={palette.text.tertiary} strokeWidth={2} />
      </Pressable>

      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {label ? (
              <Text variant="h3" tone="primary" style={{ marginBottom: 8 }}>
                {label}
              </Text>
            ) : null}
            <ScrollView bounces={false}>
              {options.map((o) => {
                const isSelected = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    disabled={o.disabled}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: isSelected, disabled: Boolean(o.disabled) }}
                    style={({ pressed }) => [
                      styles.option,
                      pressed && !o.disabled ? { backgroundColor: palette.ink[50] } : null,
                      isSelected ? { backgroundColor: palette.clinical[50] } : null,
                      o.disabled ? { opacity: 0.5 } : null,
                    ]}
                  >
                    <VStack gap={1} flex={1}>
                      <Text variant="body" tone={o.disabled ? "disabled" : "primary"}>
                        {o.label}
                      </Text>
                      {/* The reason it is unavailable, in the place the user
                          is already looking. */}
                      {o.disabled && o.disabledReason ? (
                        <Text variant="caption" tone="danger">
                          {o.disabledReason}
                        </Text>
                      ) : o.sublabel ? (
                        <Text variant="caption" tone="tertiary">
                          {o.sublabel}
                        </Text>
                      ) : null}
                    </VStack>
                    {isSelected ? (
                      <Check size={16} color={palette.clinical[700]} strokeWidth={2.4} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </VStack>
  );
}

const styles = StyleSheet.create({
  control: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: palette.surface.primary,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(11,18,32,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "70%",
    backgroundColor: palette.surface.primary,
    borderRadius: radius.xl,
    padding: 14,
    ...shadows.xl,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: radius.md,
  },
});
