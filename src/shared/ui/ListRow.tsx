import React from "react";
import { View, Pressable, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { palette, radius, layout } from "../designSystem";
import { Text } from "./Text";
import { HStack, VStack } from "./Stack";
import { useBreakpoint } from "./useBreakpoint";

interface RowProps {
  title: string;
  subtitle?: string;
  meta?: string;
  leading?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  /** Left rule in a signal colour. */
  accentColor?: string;
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ListRow({
  title,
  subtitle,
  meta,
  leading,
  right,
  onPress,
  accentColor,
  showChevron,
  style,
}: RowProps) {
  const { isPhone } = useBreakpoint();

  const body = (
    <View
      style={[
        styles.row,
        { minHeight: isPhone ? layout.rowHeightPhone : layout.rowHeight },
        accentColor ? { borderLeftWidth: 3, borderLeftColor: accentColor } : null,
        style,
      ]}
    >
      <HStack gap={12} align="center">
        {leading}
        <VStack gap={2} flex={1}>
          <Text variant="label-lg" tone="primary" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="body-sm" tone="tertiary" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </VStack>
        {meta ? (
          <Text variant="label-sm" tone="tertiary" tabular>
            {meta}
          </Text>
        ) : null}
        {right}
        {showChevron && onPress ? (
          <ChevronRight size={16} color={palette.text.tertiary} strokeWidth={2} />
        ) : null}
      </HStack>
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, meta].filter(Boolean).join(", ")}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
    >
      {body}
    </Pressable>
  );
}

export function ListGroup({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "center",
    backgroundColor: palette.surface.primary,
  },
  group: {
    borderWidth: 1,
    borderColor: palette.border.default,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: palette.surface.primary,
  },
  divider: { height: 1, backgroundColor: palette.border.subtle },
});
