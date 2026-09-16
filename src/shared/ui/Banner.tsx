import React from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ViewStyle,
  StyleProp,
} from "react-native";
import {
  X,
  Info,
  TriangleAlert,
  CircleCheck,
  CircleAlert,
} from "lucide-react-native";
import { palette, radius } from "../designSystem";
import { Text } from "./Text";
import { HStack, VStack } from "./Stack";

type Tone = "info" | "success" | "warning" | "danger";

const TONES = {
  info: { ...palette.info, Icon: Info },
  success: { ...palette.success, Icon: CircleCheck },
  warning: { ...palette.warning, Icon: TriangleAlert },
  danger: { ...palette.danger, Icon: CircleAlert },
} as const;

interface Props {
  tone?: Tone;
  title?: string;
  message: string;
  action?: React.ReactNode;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Non-interrupting software feedback ("saved", "offline"); patient state belongs in ClinicalAlert. */
export function Banner({
  tone = "info",
  title,
  message,
  action,
  onDismiss,
  style,
}: Props) {
  const t = TONES[tone];
  const Icon = t.Icon;

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.wrap,
        { backgroundColor: t.bg, borderColor: t.border },
        style,
      ]}
    >
      <HStack gap={10} align="flex-start">
        <Icon
          size={18}
          color={t.text}
          strokeWidth={2.2}
          style={{ marginTop: 1 }}
        />
        <VStack gap={2} flex={1}>
          {title ? (
            <Text variant="label" weight="600" style={{ color: t.text }}>
              {title}
            </Text>
          ) : null}
          <Text variant="body-sm" style={{ color: t.text }}>
            {message}
          </Text>
          {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
        </VStack>
        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <X size={16} color={t.text} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </HStack>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
  },
});
