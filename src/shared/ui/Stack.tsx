import React from "react";
import { View, ViewStyle, StyleProp, FlexAlignType } from "react-native";

interface StackProps {
  children?: React.ReactNode;
  direction?: "row" | "column";
  gap?: number;
  align?: FlexAlignType;
  justify?: ViewStyle["justifyContent"];
  wrap?: boolean;
  flex?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  /**
   * For a group whose children need a named parent: "tablist" around tab
   * chips, "radiogroup" around radio chips. Without it a screen reader reads
   * orphaned tabs with no position or count.
   */
  role?: "tablist" | "radiogroup" | "group" | "list";
}

export function Stack({
  children,
  direction = "column",
  gap = 0,
  align,
  justify,
  wrap,
  flex,
  style,
  testID,
  accessibilityLabel,
  role,
}: StackProps) {
  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      role={role}
      style={[
        {
          flexDirection: direction,
          gap,
          alignItems: align,
          justifyContent: justify,
          flexWrap: wrap ? "wrap" : "nowrap",
          ...(flex !== undefined ? { flex } : {}),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function VStack(props: Omit<StackProps, "direction">) {
  return <Stack {...props} direction="column" />;
}

export function HStack(props: Omit<StackProps, "direction">) {
  return <Stack {...props} direction="row" />;
}
