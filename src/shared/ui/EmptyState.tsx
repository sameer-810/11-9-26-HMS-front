import React from "react";
import { View, StyleSheet } from "react-native";
import { Inbox, type LucideIcon } from "lucide-react-native";
import { palette, radius } from "../designSystem";
import { Text } from "./Text";
import { VStack } from "./Stack";

interface Props {
  icon?: LucideIcon;
  title: string;
  message?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, message, action }: Props) {
  const Icon = icon ?? Inbox;
  return (
    <View style={styles.wrap}>
      <VStack gap={10} align="center">
        <View style={styles.iconWrap}>
          <Icon size={22} color={palette.text.tertiary} strokeWidth={1.7} />
        </View>
        <Text variant="h3" tone="secondary" center>
          {title}
        </Text>
        {message ? (
          <Text variant="body-sm" tone="tertiary" center style={{ maxWidth: 380 }}>
            {message}
          </Text>
        ) : null}
        {action ? <View style={{ marginTop: 4 }}>{action}</View> : null}
      </VStack>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 44,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.border.default,
    borderRadius: radius.lg,
    backgroundColor: palette.surface.primary,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: palette.surface.tertiary,
    alignItems: "center",
    justifyContent: "center",
  },
});
