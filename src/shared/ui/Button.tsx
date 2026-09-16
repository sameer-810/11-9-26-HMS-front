import React from "react";
import {
  Pressable,
  View,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  StyleProp,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  palette,
  radius,
  outline,
  layout,
  motion,
  signal,
} from "../designSystem";
import { haptic, type FeedbackTone } from "../touchFeedback";
import { Text } from "./Text";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant =
  "primary" | "secondary" | "ghost" | "accent" | "destructive" | "critical";
type Size = "xs" | "sm" | "md" | "lg";

interface Props {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  hapticTone?: FeedbackTone | "none";
  accessibilityHint?: string;
  testID?: string;
}

const DESKTOP = {
  xs: { height: 28, px: 10, fontSize: 12 },
  sm: { height: 32, px: 12, fontSize: 13 },
  md: { height: 36, px: 14, fontSize: 14 },
  lg: { height: 40, px: 18, fontSize: 14 },
} as const;

/** Phone sizes never drop below the 44pt touch target (WCAG 2.5.5); only padding shrinks. */
const PHONE = {
  xs: { height: layout.minTouchTarget, px: 12, fontSize: 13 },
  sm: { height: layout.minTouchTarget, px: 14, fontSize: 13 },
  md: { height: 46, px: 16, fontSize: 14 },
  lg: { height: 50, px: 20, fontSize: 15 },
} as const;

export function Button({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
  size = "md",
  icon,
  rightIcon,
  fullWidth = true,
  style,
  hapticTone,
  accessibilityHint,
  testID,
}: Props) {
  const press = useSharedValue(0);
  const { width } = useWindowDimensions();
  const isDisabled = disabled || loading;
  const c = getVariantColors(variant);
  const s = (width >= layout.wideBreakpoint ? DESKTOP : PHONE)[size];
  const tone: FeedbackTone | "none" =
    hapticTone ?? (c.borderWidth === 0 ? "impact" : "select");

  const onPressIn = () => {
    press.set(withTiming(1, { duration: motion.duration.instant }));
    if (tone !== "none") haptic(tone);
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.get() * 0.03 }],
    opacity: (isDisabled ? 0.5 : 1) - press.get() * 0.12,
  }));

  return (
    <View style={[fullWidth ? { alignSelf: "stretch" } : undefined, style]}>
      <AnimatedPressable
        onPress={onPress}
        disabled={isDisabled}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{
          disabled: Boolean(isDisabled),
          busy: Boolean(loading),
        }}
        onPressIn={onPressIn}
        onPressOut={() => press.set(withSpring(0, motion.spring.crisp))}
        style={[
          styles.base,
          {
            minHeight: s.height,
            paddingHorizontal: s.px,
            paddingVertical: 6,
            backgroundColor: c.bg,
            borderColor: c.border,
            borderWidth: c.borderWidth,
          },
          animStyle,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={c.text} size="small" />
        ) : (
          <View style={styles.row}>
            {icon ? <View style={{ marginRight: 6 }}>{icon}</View> : null}
            <Text
              variant="label"
              weight="600"
              style={{ color: c.text, fontSize: s.fontSize }}
            >
              {label}
            </Text>
            {rightIcon ? (
              <View style={{ marginLeft: 6 }}>{rightIcon}</View>
            ) : null}
          </View>
        )}
      </AnimatedPressable>
    </View>
  );
}

function getVariantColors(v: Variant) {
  switch (v) {
    case "primary":
      return {
        bg: palette.clinical[700],
        text: "#FFFFFF",
        border: palette.clinical[700],
        borderWidth: 0,
      };
    case "accent":
      return {
        bg: palette.teal[700],
        text: "#FFFFFF",
        border: palette.teal[700],
        borderWidth: 0,
      };
    case "secondary":
      return {
        bg: palette.surface.primary,
        text: palette.text.primary,
        border: outline.color,
        borderWidth: 1,
      };
    case "ghost":
      return {
        bg: "transparent",
        text: palette.text.accent,
        border: "transparent",
        borderWidth: 0,
      };
    case "destructive":
      return {
        bg: palette.danger.text,
        text: "#FFFFFF",
        border: palette.danger.text,
        borderWidth: 0,
      };
    // Only for confirming inside a critical clinical alert; distinct from "destructive".
    case "critical":
      return {
        bg: signal.critical.color,
        text: signal.critical.onColor,
        border: signal.critical.color,
        borderWidth: 0,
      };
  }
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center" },
});
