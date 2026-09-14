import React from "react";
import { StyleSheet, View } from "react-native";
import { palette, chartSeries } from "@shared/designSystem";
import { Card, HStack, Text, VStack } from "@shared/ui";
import { shortDate } from "@shared/format";
import type { ReportSeriesPoint } from "@modules/reports/types";

const PLOT_HEIGHT = 140;
/** Enough date labels to place a bar in time, few enough not to collide. */
const MAX_TICKS = 6;
const TICK_WIDTH = 56;

/** The first numeric field on a series point, `date` aside. */
export function firstNumericField(series: ReportSeriesPoint[]): string | null {
  const sample = series[0];
  if (!sample) return null;
  return Object.keys(sample).find((k) => k !== "date" && typeof sample[k] === "number") ?? null;
}

interface Props {
  series: ReportSeriesPoint[];
  field: string;
  title: string;
  formatValue: (n: number) => string;
}

/**
 * Day-by-day bars out of plain Views.
 *
 * No chart library: one series, one colour, one axis is all a trend over a
 * date range needs, and a dependency that renders differently on web and
 * native is a larger cost than forty lines of layout. The table below it
 * carries the exact numbers; this only has to show the shape.
 */
export function SeriesChart({ series, field, title, formatValue }: Props) {
  const values = series.map((p) => {
    const v = p[field];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  });
  const max = Math.max(0, ...values);
  const total = values.reduce((n, v) => n + v, 0);
  const step = Math.max(1, Math.ceil(series.length / MAX_TICKS));
  // Start half a step in, so the first label does not hang off the left edge.
  const firstTick = Math.floor(step / 2);

  return (
    <Card testID="report-chart">
      <VStack gap={10}>
        <HStack gap={8} align="center" justify="space-between" wrap>
          <Text variant="label">{title}</Text>
          <Text variant="caption" tone="tertiary" tabular>
            Peak {formatValue(max)} · Total {formatValue(total)}
          </Text>
        </HStack>

        <View
          style={[styles.plot, { gap: series.length > 60 ? 0 : 2 }]}
          accessibilityRole="image"
          accessibilityLabel={`${title}: ${series.length} days, peak ${formatValue(max)}, total ${formatValue(total)}`}
        >
          {values.map((v, i) => (
            <View key={series[i].date} style={styles.column}>
              <View
                style={[
                  styles.bar,
                  // A non-zero day always shows at least a sliver, so "one" is
                  // not drawn the same as "none" beside a peak of hundreds.
                  { height: max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * PLOT_HEIGHT) : 0 },
                ]}
              />
            </View>
          ))}
        </View>

        <View style={styles.axis}>
          {series.map((p, i) =>
            i % step === firstTick ? (
              <Text
                key={p.date}
                variant="caption"
                tone="tertiary"
                numberOfLines={1}
                style={[styles.tick, { left: `${((i + 0.5) / series.length) * 100}%` as `${number}%` }]}
              >
                {shortDate(p.date).replace(/ \d{4}$/, "")}
              </Text>
            ) : null,
          )}
        </View>
      </VStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  plot: {
    height: PLOT_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: palette.border.default,
  },
  column: { flex: 1, minWidth: 0, height: "100%", justifyContent: "flex-end" },
  bar: { backgroundColor: chartSeries[0], borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  axis: { height: 16 },
  tick: { position: "absolute", width: TICK_WIDTH, marginLeft: -TICK_WIDTH / 2, textAlign: "center" },
});
