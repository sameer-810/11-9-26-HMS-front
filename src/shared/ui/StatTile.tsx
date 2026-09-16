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
  /** What pressing the tile does, read after its figure: "Opens the OPD queue". */
  hint?: string;
  testID?: string;
}

/** Dashboard number. `attention` flags workload needing action, without the clinical signal colours. */
export function StatTile({
  label,
  value,
  sublabel,
  icon,
  accent = "neutral",
  onPress,
  attention,
  hint,
  testID,
}: Props) {
  const a = accents[accent];
  const Icon = icon;

  return (
    <Card
      onPress={onPress}
      compact
      accentColor={attention ? a.color : undefined}
      style={styles.wrap}
      // Card has no hint prop, so the hint is appended to the label.
      accessibilityLabel={`${label}: ${value}${sublabel ? `, ${sublabel}` : ""}${onPress && hint ? `. ${hint}` : ""}`}
      testID={testID}
    >
      <VStack gap={8}>
        <HStack gap={8} align="center" justify="space-between">
          <Text
            variant="label-sm"
            tone="tertiary"
            numberOfLines={1}
            style={{ flex: 1 }}
          >
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
