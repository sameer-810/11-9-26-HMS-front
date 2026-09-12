import React from "react";
import { View, StyleSheet } from "react-native";
import { TrendingUp, TrendingDown, Minus, CircleHelp } from "lucide-react-native";
import { palette, radius, signal, numeric, type SignalLevel } from "@shared/designSystem";
import { Text, HStack, VStack, SignalBadge } from "@shared/ui";
import type { News2Band, News2Result, EarlyWarning } from "@modules/inpatient/types";

/**
 * The NEWS2 score, shown the way a ward can act on.
 *
 * ---------------------------------------------------------------------------
 * Three rules this component exists to keep
 * ---------------------------------------------------------------------------
 *
 * 1. AN INCOMPLETE SCORE IS NEVER SHOWN AS A SCORE. When the server says
 *    `complete: false` there is no number here at all — there is a prompt for
 *    the missing parameters. A "2" the reader cannot tell was computed without
 *    a respiratory rate is worse than no number, because it will be acted on.
 *
 * 2. THE BAND TRAVELS WITH THE NUMBER. "7" asks the reader to remember a chart
 *    on a wall at 4am. "High — continuous monitoring" does not.
 *
 * 3. COLOUR IS NEVER THE ONLY CARRIER. The band label is written out and the
 *    SignalBadge carries a distinct icon shape per tier, so the score survives
 *    greyscale and colour vision deficiency.
 */

interface Props {
  result?: News2Result | null;
  /** The ward-board form: a denormalised score with no parameter breakdown. */
  summary?: EarlyWarning | null;
  size?: "sm" | "md" | "lg";
  /** Show the monitoring frequency and response text underneath. */
  showResponse?: boolean;
}

function tierOf(band: News2Band | null | undefined): SignalLevel {
  return (band?.tier as SignalLevel) ?? "normal";
}

export function News2Score({ result, summary, size = "md", showResponse = false }: Props) {
  // ---- The incomplete case, first, because it is the one that goes wrong ----
  if (result && !result.complete) {
    return (
      <View style={[styles.wrap, styles.incomplete]} accessibilityRole="text">
        <HStack gap={8} align="center">
          <CircleHelp size={18} color={palette.text.secondary} />
          <VStack gap={2} style={{ flex: 1 }}>
            <Text variant="label" tone="secondary">
              No NEWS2 score
            </Text>
            <Text variant="caption" tone="secondary">
              {result.missing.length === 1
                ? "One observation is missing"
                : `${result.missing.length} observations are missing`}
              {result.redFlagParameters.length > 0
                ? ` — but ${result.redFlagParameters.join(" and ")} is severely abnormal.`
                : "."}
            </Text>
          </VStack>
        </HStack>
      </View>
    );
  }

  const score = result?.complete ? result.total : (summary?.score ?? null);
  const band: News2Band | null = result?.band
    ? result.band
    : summary?.band
      ? {
          key: summary.band,
          label: summary.label.split(" · ")[0],
          tier: summary.tier,
          monitoringFrequency: summary.monitoringFrequency,
          response: summary.response,
        }
      : null;

  if (score === null || score === undefined) {
    return (
      <View style={[styles.wrap, styles.incomplete]} accessibilityRole="text">
        <HStack gap={8} align="center">
          <CircleHelp size={18} color={signal.caution.text} />
          <Text variant="label" tone="secondary">
            No observations recorded
          </Text>
        </HStack>
      </View>
    );
  }

  const tier = tierOf(band);
  const s = signal[tier];
  const delta = result?.delta ?? null;
  const TrendIcon =
    delta === null ? Minus : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;

  const numberStyle =
    size === "lg" ? styles.numberLg : size === "sm" ? styles.numberSm : styles.numberMd;

  return (
    <View
      style={[styles.wrap, { borderColor: s.border, backgroundColor: s.bg }]}
      accessibilityRole="text"
      accessibilityLabel={`NEWS 2 score ${score}, ${band?.label ?? "unbanded"}${
        band?.response ? `. ${band.response}` : ""
      }`}
    >
      <HStack gap={12} align="center">
        <View style={[styles.scoreBox, { borderColor: s.border }]}>
          <Text style={[numberStyle, { color: s.text }, numeric]}>{score}</Text>
          <Text variant="caption" style={{ color: s.text }}>
            NEWS2
          </Text>
        </View>

        <VStack gap={4} style={{ flex: 1 }}>
          <HStack gap={6} align="center" wrap>
            <SignalBadge level={tier} label={band?.label ?? "Scored"} size="sm" />
            {result?.scale === 2 ? (
              <View style={styles.scalePill}>
                <Text variant="caption" tone="secondary">
                  Scale 2
                </Text>
              </View>
            ) : null}
            {delta !== null && delta !== 0 ? (
              <HStack gap={3} align="center">
                <TrendIcon
                  size={13}
                  color={delta > 0 ? signal.urgent.text : signal.normal.text}
                />
                <Text
                  variant="caption"
                  style={{ color: delta > 0 ? signal.urgent.text : signal.normal.text }}
                >
                  {delta > 0 ? `+${delta}` : delta} since last
                </Text>
              </HStack>
            ) : null}
          </HStack>

          {/**
           * A rise of 2 is its own warning, separate from the band. A patient
           * moving from 1 to 3 sits in no alarming band at all, but they are
           * going the wrong way — and that is exactly the signal a shift change
           * loses.
           */}
          {result?.significantRise ? (
            <Text variant="caption" style={{ color: signal.urgent.text }}>
              Rising. Review before the number itself is alarming.
            </Text>
          ) : null}

          {result?.redFlagParameters?.length ? (
            <Text variant="caption" tone="secondary">
              Driven by {result.redFlagParameters.join(", ")}
            </Text>
          ) : null}

          {showResponse && band?.monitoringFrequency ? (
            <VStack gap={2} style={styles.response}>
              <Text variant="caption" weight="600" tone="secondary">
                {band.monitoringFrequency}
              </Text>
              {band.response ? (
                <Text variant="caption" tone="secondary">
                  {band.response}
                </Text>
              ) : null}
            </VStack>
          ) : null}
        </VStack>
      </HStack>
    </View>
  );
}

/** The compact form, for a ward-board row. */
export function News2Pill({ summary }: { summary: EarlyWarning }) {
  if (summary.score === null) {
    return <SignalBadge level="caution" label="No obs" size="sm" />;
  }
  const tier = (summary.tier as SignalLevel) ?? "normal";
  return (
    <HStack gap={6} align="center">
      <SignalBadge level={tier} label={`NEWS ${summary.score}`} size="sm" />
      {/**
       * Overdue is measured against the band's OWN frequency. Four hours
       * without an observation on a high-risk patient is a different fact from
       * four hours on a routine one, and a fixed interval flattens that.
       */}
      {summary.overdue ? (
        <Text variant="caption" style={{ color: signal.urgent.text }}>
          obs overdue
        </Text>
      ) : null}
    </HStack>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    backgroundColor: palette.surface.raised,
    borderColor: palette.border.default,
  },
  incomplete: {
    borderStyle: "dashed",
    backgroundColor: palette.surface.sunken,
  },
  scoreBox: {
    minWidth: 62,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    backgroundColor: palette.surface.raised,
  },
  numberSm: { fontSize: 20, fontWeight: "700", lineHeight: 24 },
  numberMd: { fontSize: 28, fontWeight: "700", lineHeight: 32 },
  numberLg: { fontSize: 38, fontWeight: "700", lineHeight: 42 },
  scalePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.sunken,
  },
  response: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: palette.border.subtle,
  },
});
