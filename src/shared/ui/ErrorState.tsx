import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { CloudOff } from "lucide-react-native";
import { palette, radius } from "../designSystem";
import { Text } from "./Text";
import { VStack } from "./Stack";
import { Button } from "./Button";
import { apiErrorMessage } from "../api/apiClient";

interface Props {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  retrying?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A failure a clinician can act on.
 *
 * The server's own message is shown rather than a generic apology, because
 * "your session expired", "this hospital is awaiting approval" and "the network
 * is down" call for three different responses from the person reading it, and
 * collapsing them into "Something went wrong" guarantees a support call.
 */
export function ErrorState({ error, title = "Couldn't load this", onRetry, retrying, style }: Props) {
  return (
    <View style={[styles.wrap, style]} accessibilityRole="alert">
      <VStack gap={10} align="center">
        <CloudOff size={24} color={palette.danger.text} strokeWidth={1.8} />
        <Text variant="h3" tone="primary" center>
          {title}
        </Text>
        <Text variant="body-sm" tone="secondary" center style={{ maxWidth: 420 }}>
          {apiErrorMessage(error)}
        </Text>
        {onRetry ? (
          <Button
            label="Try again"
            variant="secondary"
            size="sm"
            fullWidth={false}
            loading={retrying}
            onPress={onRetry}
          />
        ) : null}
      </VStack>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.danger.border,
    borderRadius: radius.lg,
    backgroundColor: palette.danger.bg,
  },
});
