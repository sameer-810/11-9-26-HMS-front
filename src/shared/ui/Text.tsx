import React from "react";
import { Text as RNText, TextProps, StyleProp, TextStyle } from "react-native";
import { typography, palette, numeric } from "../designSystem";

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
 * How far the OS font-size setting may enlarge each variant.
 *
 * Body and headings are deliberately UNCAPPED. WCAG 1.4.4 requires text to
 * survive 200% enlargement, and a clinician who has turned the system font up
 * has done so because they cannot otherwise read it — capping their setting to
 * protect a layout is choosing the layout over the reader.
 *
 * The capped variants are the ones where runaway growth breaks meaning rather
 * than appearance: a metric tile whose number wraps mid-digit is worse than a
 * slightly smaller number, and an overline that wraps stops reading as a label.
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
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

export function Text({
  variant = "body",
  tone = "primary",
  weight,
  tabular,
  center,
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
    >
      {children}
    </RNText>
  );
}
