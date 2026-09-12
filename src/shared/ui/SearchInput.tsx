import React from "react";
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

/**
 * One search box for the whole app.
 *
 * Exists because the alternative — each screen rolling its own — is how you end
 * up with eight subtly different search affordances and a clear button that is
 * present on six of them.
 */
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

  return (
    <View style={[styles.wrap, { minHeight: height }, style]}>
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
