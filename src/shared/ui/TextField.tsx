import React, { useId, useState } from "react";
import {
  View,
  TextInput,
  TextInputProps,
  StyleSheet,
  Pressable,
  ViewStyle,
  StyleProp,
} from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { palette, radius, numeric } from "../designSystem";
import { Text } from "./Text";
import { HStack, VStack } from "./Stack";
import { useControlHeight } from "./useBreakpoint";
import { domId, webAria } from "./a11y";

interface Props extends Omit<TextInputProps, "style"> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Tabular figures + numeric keypad — doses, readings, amounts. */
  numericField?: boolean;
  /** Unit shown inside the field: "mg", "mmHg", "°C". */
  suffix?: string;
  containerStyle?: StyleProp<ViewStyle>;
  multiline?: boolean;
}

export function TextField({
  label,
  error,
  hint,
  required,
  leading,
  trailing,
  numericField,
  suffix,
  containerStyle,
  multiline,
  secureTextEntry,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  const controlHeight = useControlHeight();
  const messageId = domId(useId(), "message");

  const isPassword = Boolean(secureTextEntry);

  return (
    <VStack gap={5} style={containerStyle}>
      {label ? (
        <HStack gap={3} align="center">
          <Text variant="label" tone="secondary">
            {label}
          </Text>
          {required ? (
            // Decorative: "required" reaches assistive technology through
            // aria-required on the input, not by reading an asterisk aloud.
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

      <View
        style={[
          styles.field,
          {
            minHeight: multiline ? 88 : controlHeight,
            alignItems: multiline ? "flex-start" : "center",
            borderColor: error
              ? palette.danger.text
              : focused
                ? palette.border.focus
                : palette.border.default,
            // Two-pixel ring on focus. Keyboard users navigating a long
            // registration form need to see where they are without hunting.
            borderWidth: focused || error ? 2 : 1,
            paddingVertical: multiline ? 8 : 0,
          },
        ]}
      >
        {leading ? <View style={{ marginRight: 8 }}>{leading}</View> : null}

        <TextInput
          {...rest}
          multiline={multiline}
          secureTextEntry={isPassword && !reveal}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          keyboardType={numericField ? "decimal-pad" : rest.keyboardType}
          placeholderTextColor={palette.text.disabled}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          // Spoken by a screen reader on focus, so the error is not something
          // only sighted users learn about.
          accessibilityHint={error ?? hint}
          // The web equivalent: the message is programmatically tied to the
          // field, and the field says it is invalid or required.
          {...webAria({
            describedBy: error || hint ? messageId : undefined,
            invalid: Boolean(error),
            required,
          })}
          style={[
            styles.input,
            numericField ? numeric : null,
            multiline ? { textAlignVertical: "top", minHeight: 70 } : null,
          ]}
        />

        {suffix ? (
          <Text variant="label-sm" tone="tertiary" style={{ marginLeft: 6 }}>
            {suffix}
          </Text>
        ) : null}

        {isPassword ? (
          <Pressable
            onPress={() => setReveal((r) => !r)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={reveal ? "Hide password" : "Show password"}
            style={{ marginLeft: 6 }}
          >
            {reveal ? (
              <EyeOff
                size={16}
                color={palette.text.tertiary}
                strokeWidth={1.9}
              />
            ) : (
              <Eye size={16} color={palette.text.tertiary} strokeWidth={1.9} />
            )}
          </Pressable>
        ) : null}

        {trailing ? <View style={{ marginLeft: 6 }}>{trailing}</View> : null}
      </View>

      {error ? (
        // An alert, so it is announced the moment it appears — after a submit
        // the user's focus is on the button, not on the field that failed.
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
    </VStack>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    borderRadius: radius.md,
    backgroundColor: palette.surface.primary,
    paddingHorizontal: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: palette.text.primary,
    paddingVertical: 0,
    // Web-only: the browser's default focus ring duplicates ours — the field
    // container's two-pixel focus-colour border above.
    outlineStyle: "none",
  } as never,
});
