import React, { useId, useState } from "react";
import { Pressable, Modal, ScrollView, StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { ChevronDown, Check } from "lucide-react-native";
import { palette, radius, shadows } from "../designSystem";
import { Text } from "./Text";
import { HStack, VStack } from "./Stack";
import { useControlHeight } from "./useBreakpoint";
import { domId, webAria } from "./a11y";

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
 * Modal select; disabled options are shown with their reason rather than hidden.
 * Keyboard: Enter/Space opens, focus stays in the sheet, Escape closes and restores focus.
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
  const reduceMotion = useReducedMotion();
  const messageId = domId(useId(), "message");
  const selected = options.find((o) => o.value === value);

  return (
    <VStack gap={5}>
      {label ? (
        <HStack gap={3} align="center">
          <Text variant="label" tone="secondary">
            {label}
          </Text>
          {required ? (
            <Text
              variant="label"
              style={{ color: palette.danger.text }}
              aria-hidden
            >
              *
            </Text>
          ) : null}
        </HStack>
      ) : null}

      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        // aria-required is invalid on a button, so "Required" is appended to the label.
        accessibilityLabel={`${label ? `${label}. ${selected?.label ?? placeholder}` : placeholder}${required ? ". Required" : ""}`}
        accessibilityState={{ disabled: Boolean(disabled), expanded: open }}
        {...webAria({
          hasPopup: "menu",
          expanded: open,
          describedBy: error || hint ? messageId : undefined,
          invalid: Boolean(error),
        })}
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
          // Tertiary tone keeps the placeholder at text contrast (5.9:1).
          tone={selected ? "primary" : "tertiary"}
          numberOfLines={1}
          style={{ flex: 1 }}
        >
          {selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={16} color={palette.text.tertiary} strokeWidth={2} />
      </Pressable>

      {error ? (
        <Text
          variant="caption"
          tone="danger"
          nativeID={messageId}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="tertiary" nativeID={messageId}>
          {hint}
        </Text>
      ) : null}

      <Modal
        visible={open}
        transparent
        animationType={reduceMotion ? "none" : "fade"}
        onRequestClose={() => setOpen(false)}
      >
        {/* Backdrop and sheet are pointer-only, not Tab stops. */}
        <Pressable
          style={styles.overlay}
          onPress={() => setOpen(false)}
          focusable={false}
        >
          <Pressable style={styles.sheet} onPress={() => {}} focusable={false}>
            {label ? (
              <Text
                variant="h3"
                tone="primary"
                heading={2}
                style={{ marginBottom: 8 }}
              >
                {label}
              </Text>
            ) : null}
            <ScrollView bounces={false}>
              <View
                accessibilityRole="menu"
                accessibilityLabel={label ?? placeholder}
              >
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
                      accessibilityState={{
                        selected: isSelected,
                        disabled: Boolean(o.disabled),
                      }}
                      style={({ pressed }) => [
                        styles.option,
                        pressed && !o.disabled
                          ? { backgroundColor: palette.ink[50] }
                          : null,
                        isSelected
                          ? { backgroundColor: palette.clinical[50] }
                          : null,
                        o.disabled ? { opacity: 0.5 } : null,
                      ]}
                    >
                      <VStack gap={1} flex={1}>
                        <Text
                          variant="body"
                          tone={o.disabled ? "disabled" : "primary"}
                        >
                          {o.label}
                        </Text>
                        {}
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
                        <Check
                          size={16}
                          color={palette.clinical[700]}
                          strokeWidth={2.4}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
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
