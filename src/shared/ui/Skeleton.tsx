import React, { useEffect } from "react";
import { DimensionValue, StyleProp, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  useReducedMotion,
} from "react-native-reanimated";
import { palette, radius } from "../designSystem";

interface Props {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = "100%", height = 14, radius: r = radius.sm, style }: Props) {
  const pulse = useSharedValue(0.45);
  // A pulse is decoration. Someone who has asked the OS for less motion gets
  // the placeholder shape, still — WCAG 2.3.3.
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    pulse.set(
      withRepeat(
        withSequence(withTiming(0.85, { duration: 700 }), withTiming(0.45, { duration: 700 })),
        -1,
        false,
      ),
    );
  }, [pulse, reduceMotion]);

  const animStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));

  return (
    <Animated.View
      accessibilityLabel="Loading"
      style={[
        { width, height, borderRadius: r, backgroundColor: palette.ink[200] },
        animStyle,
        style,
      ]}
    />
  );
}
