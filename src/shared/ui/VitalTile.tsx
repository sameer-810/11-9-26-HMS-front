import React from "react";
import { View, StyleSheet } from "react-native";
import { ArrowUp, ArrowDown, Minus } from "lucide-react-native";
import { palette, radius, signal, valueFlag, type ValueFlag } from "../designSystem";
import { Text } from "./Text";
import { HStack, VStack } from "./Stack";

/**
 * One measured value against its reference range.
 *
 * Three things carry the abnormality, not one:
 *   - the colour of the value;
 *   - an H/L/HH/LL glyph, which is what a clinician reads off a paper report
 *     and survives greyscale printing;
 *   - the range itself, stated underneath, so the reader can judge how far out
 *     it is rather than trusting our threshold.
 *
 * The third matters more than it looks. A potassium of 5.2 flagged "high"
 * against a range of 3.5–5.1 is a different clinical situation from 6.8, and a
 * tile that only says "High" hides that difference.
 */

interface Props {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  flag?: ValueFlag;
  /** Displayed reference range, e.g. "3.5 – 5.1". */
  range?: string;
  /** Direction against the previous reading. */
  trend?: "up" | "down" | "flat";
  recordedAt?: string;
  compact?: boolean;
}

export function VitalTile({
  label,
  value,
  unit,
  flag = "normal",
  range,
  trend,
  recordedAt,
  compact,
}: Props) {
  const f = valueFlag[flag];
  const s = signal[f.signal];
  const abnormal = flag !== "normal";
  const missing = value === null || value === undefined || value === "";

  const TrendIcon = trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : Minus;

  return (
    <View
      style={[
        styles.wrap,
        compact ? styles.compact : null,
        abnormal ? { borderColor: s.border, backgroundColor: s.bg } : null,
      ]}
      accessibilityRole="text"
      accessibilityLabel={
        missing
          ? `${label}, not recorded`
          : `${label} ${value}${unit ? ` ${unit}` : ""}${abnormal ? `, ${f.label}` : ""}${range ? `, normal range ${range}` : ""}`
      }
    >
      <VStack gap={compact ? 2 : 4}>
        <HStack gap={4} align="center" justify="space-between">
          <Text variant="label-sm" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
            {label}
          </Text>
          {trend && !missing ? (
            <TrendIcon size={12} color={palette.text.tertiary} strokeWidth={2.4} />
          ) : null}
        </HStack>

        <HStack gap={4} align="baseline">
          {missing ? (
            // An em-dash, never a blank. A blank cell reads as "normal" and
            // this is missing data, which is a different clinical statement.
            <Text variant={compact ? "metric-sm" : "metric"} tone="disabled">
              —
            </Text>
          ) : (
            <>
              <Text
                variant={compact ? "metric-sm" : "metric"}
                style={{ color: abnormal ? s.text : palette.text.primary }}
              >
                {value}
              </Text>
              {unit ? (
                <Text variant="label-sm" tone="tertiary">
                  {unit}
                </Text>
              ) : null}
              {f.glyph ? (
                <View style={[styles.glyph, { backgroundColor: s.color }]}>
                  <Text variant="label-sm" weight="600" style={{ color: s.onColor, fontSize: 10 }}>
                    {f.glyph}
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </HStack>

        {range ? (
          <Text variant="caption" tone="tertiary" tabular>
            {range}
          </Text>
        ) : null}
        {recordedAt ? (
          <Text variant="caption" tone="tertiary">
            {recordedAt}
          </Text>
        ) : null}
      </VStack>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 12,
    minWidth: 120,
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.primary,
  },
  compact: { padding: 8, minWidth: 96 },
  glyph: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: radius.xs,
    marginLeft: 2,
  },
});
