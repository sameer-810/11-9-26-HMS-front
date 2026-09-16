import React, { useState } from "react";
import { View, TextInput, StyleSheet, Pressable, ViewStyle, StyleProp } from "react-native";
import { Search, X } from "lucide-react-native";
import { palette, radius } from "../designSystem";
import { useControlHeight } from "./useBreakpoint";

interface Props {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The app's single search box, with a clear button. */
export function SearchInput({
  value,
  onChangeText,
  placeholder = "Search",
  autoFocus,
  onSubmitEditing,
  style,
  testID,
}: Props) {
  const height = useControlHeight();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.wrap,
        { minHeight: height },
        // The same two-pixel focus ring as TextField: a keyboard user tabbing
        // into the patient search must see that they have arrived.
        focused ? { borderColor: palette.border.focus, borderWidth: 2, paddingHorizontal: 9 } : null,
        style,
      ]}
    >
      <Search size={16} color={palette.text.tertiary} strokeWidth={2} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.text.disabled}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={placeholder}
        testID={testID}
        style={styles.input}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText("")}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <X size={16} color={palette.text.tertiary} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.primary,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: palette.text.primary,
    paddingVertical: 0,
    outlineStyle: "none",
  } as never,
});
