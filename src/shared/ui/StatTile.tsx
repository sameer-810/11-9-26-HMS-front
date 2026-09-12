import React from "react";
import { View, StyleSheet } from "react-native";
import { type LucideIcon } from "lucide-react-native";
import { radius, accents } from "../designSystem";
import { Text } from "./Text";
import { HStack, VStack } from "./Stack";
import { Card } from "./Card";

type Accent = keyof typeof accents;

interface Props {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: LucideIcon;
  accent?: Accent;
  onPress?: () => void;
  /** Draws attention without shouting — "3 tests overdue". */
  attention?: boolean;
}

/**
 * A dashboard number.
 *
 * `attention` exists so a dashboard can distinguish "here is a count" from
 * "here is a count you need to do something about" without reaching for the
 * clinical signal ramp, which belongs to patient state rather than workload.
 */
export function StatTile({
  label,
  value,
  sublabel,
  icon,
  accent = "neutral",
  onPress,
  attention,
}: Props) {
  const a = accents[accent];
  const Icon = icon;

  return (
    <Card
      onPress={onPress}
      compact
      accentColor={attention ? a.color : undefined}
      style={styles.wrap}
      accessibilityLabel={`${label}: ${value}${sublabel ? `, ${sublabel}` : ""}`}
    >
      <VStack gap={8}>
        <HStack gap={8} align="center" justify="space-between">
          <Text variant="label-sm" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
            {label}
          </Text>
          {Icon ? (
            <View style={[styles.iconWrap, { backgroundColor: a.tint }]}>
              <Icon size={14} color={a.color} strokeWidth={2.1} />
            </View>
          ) : null}
        </HStack>
        <Text variant="metric" tone="primary">
          {value}
        </Text>
        {sublabel ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {sublabel}
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 150 },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
