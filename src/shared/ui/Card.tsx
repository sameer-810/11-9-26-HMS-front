import React from "react";
import { ViewStyle, StyleProp, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { palette, radius, shadows, outline, motion, layout } from "../designSystem";
import { haptic, type FeedbackTone } from "../touchFeedback";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Elevation = "base" | "raised" | "floating" | "overlay";

/**
 * Resting cards get no shadow at all — a dense clinical screen carrying twenty
 * soft shadows turns into mud. Depth is a hairline border; shadow is reserved
 * for things that genuinely float above the page.
 */
const ELEV: Record<Elevation, object> = {
  base: shadows.none,
  raised: shadows.none,
  floating: shadows.md,
  overlay: shadows.lg,
};

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  padded?: boolean;
  compact?: boolean;
  elevation?: Elevation;
  /** Left rule in a signal colour — a card carrying an abnormal result. */
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
  hapticTone?: FeedbackTone | "none";
  accessibilityLabel?: string;
  testID?: string;
}

const PRESS_SCALE = 0.985;
const PRESS_DIM = 0.92;

export function Card({
  children,
  onPress,
  padded = true,
  compact = false,
  elevation: level = "base",
  accentColor,
  style,
  hapticTone = "select",
  accessibilityLabel,
  testID,
}: Props) {
  const press = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => {
    const p = press.get();
    return {
      transform: [{ scale: 1 - p * (1 - PRESS_SCALE) }],
      opacity: 1 - p * (1 - PRESS_DIM),
    };
  });

  const base: ViewStyle = {
    backgroundColor: palette.surface.primary,
    borderRadius: radius.lg,
    borderWidth: outline.width,
    borderColor: outline.color,
    padding: padded ? (compact ? layout.cardPaddingCompact : layout.cardPadding) : 0,
    ...(accentColor ? { borderLeftWidth: 3, borderLeftColor: accentColor } : {}),
    ...ELEV[level],
  };

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPressIn={() => {
          press.set(withSpring(1, motion.spring.crisp));
          if (hapticTone !== "none") haptic(hapticTone);
        }}
        onPressOut={() => press.set(withSpring(0, motion.spring.gentle))}
        style={[base, style, animStyle]}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return (
    <Animated.View testID={testID} style={[base, style]}>
      {children}
    </Animated.View>
  );
}
