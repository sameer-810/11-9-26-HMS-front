import React from "react";
import { View } from "react-native";
import { Text } from "./Text";
import { HStack, VStack } from "./Stack";

interface Props {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export function SectionHeader({ title, subtitle, right }: Props) {
  return (
    <HStack gap={12} align="center" justify="space-between" style={{ marginBottom: 10 }}>
      <VStack gap={1} flex={1}>
        <Text variant="h3" tone="primary" heading={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="tertiary">
            {subtitle}
          </Text>
        ) : null}
      </VStack>
      {right ? <View style={{ flexShrink: 0 }}>{right}</View> : null}
    </HStack>
  );
}
