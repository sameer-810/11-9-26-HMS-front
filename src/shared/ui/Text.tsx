import React from "react";
import { Text as RNText, TextProps, StyleProp, TextStyle } from "react-native";
import { typography, palette, numeric } from "../designSystem";
import { webAria } from "./a11y";

type Variant =
  | "display-lg"
  | "display"
  | "display-sm"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "body-lg"
  | "body"
  | "body-sm"
  | "label-lg"
  | "label"
  | "label-sm"
  | "caption"
  | "overline"
  | "metric"
  | "metric-sm";

type Tone =
  | "primary"
  | "secondary"
  | "tertiary"
  | "disabled"
  | "inverse"
  | "accent"
  | "link"
  | "success"
  | "warning"
  | "danger"
  | "info";

const VARIANTS: Record<Variant, TextStyle> = {
  "display-lg": typography.display.large,
  display: typography.display.medium,
  "display-sm": typography.display.small,
  h1: typography.heading.h1,
  h2: typography.heading.h2,
  h3: typography.heading.h3,
  h4: typography.heading.h4,
  "body-lg": typography.body.large,
  body: typography.body.default,
  "body-sm": typography.body.small,
  "label-lg": typography.label.large,
  label: typography.label.medium,
  "label-sm": typography.label.small,
  caption: typography.caption,
  overline: typography.overline,
  metric: typography.metric,
  "metric-sm": typography.metricSmall,
};

const TONES: Record<Tone, string> = {
  primary: palette.text.primary,
  secondary: palette.text.secondary,
  tertiary: palette.text.tertiary,
  disabled: palette.text.disabled,
  inverse: palette.text.inverse,
  accent: palette.text.accent,
  link: palette.text.link,
  success: palette.success.text,
  warning: palette.warning.text,
  danger: palette.danger.text,
  info: palette.info.text,
};

/**
 * Caps on OS font scaling. Body and headings stay uncapped (WCAG 1.4.4); metrics and
 * overlines are capped because wrapping breaks their meaning.
 */
const MAX_SCALE: Partial<Record<Variant, number>> = {
  overline: 1.3,
  caption: 1.5,
  "label-sm": 1.5,
  metric: 1.4,
  "metric-sm": 1.4,
};

interface Props extends TextProps {
  variant?: Variant;
  tone?: Tone;
  weight?: "400" | "500" | "600";
  /** Tabular figures. Automatic on metric variants; opt in for table cells. */
  tabular?: boolean;
  center?: boolean;
  /** Heading outline level for screen readers; separate from `variant`, which only sets size. */
  heading?: 1 | 2 | 3 | 4;
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

export function Text({
  variant = "body",
  tone = "primary",
  weight,
  tabular,
  center,
  heading,
  style,
  children,
  ...rest
}: Props) {
  const base = VARIANTS[variant];
  const isMetric = variant === "metric" || variant === "metric-sm";

  return (
    <RNText
      maxFontSizeMultiplier={MAX_SCALE[variant]}
      style={[
        base,
        { color: TONES[tone] },
        weight ? { fontWeight: weight } : null,
        tabular || isMetric ? numeric : null,
        center ? { textAlign: "center" } : null,
        style,
      ]}
      {...rest}
      {...(heading ? { accessibilityRole: "header" as const, ...webAria({ level: heading }) } : null)}
    >
      {children}
    </RNText>
  );
}
