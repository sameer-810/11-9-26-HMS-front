import React from "react";
import { View, StyleSheet } from "react-native";
import { TrendingUp, TrendingDown } from "lucide-react-native";
import { palette, signal } from "@shared/designSystem";
import { Text, HStack, VStack } from "@shared/ui";
import { formatDateTime } from "@shared/format";
import { LabFlagGlyph, flagPresentation } from "./LabFlag";
import type { LabResult } from "@modules/laboratory/types";

/**
 * A set of results, read the way a paper report is read.
 *
 * Value, glyph, then the range it was flagged against — stated beside the
 * value, so the reader can judge how far out it is rather than trusting a
 * colour. A potassium of 5.2 and one of 6.9 are both "H" to a threshold; they
 * are not the same to a patient.
 *
 * The trend line appears only when the change is significant. A delta on every
 * row is noise; a creatinine up 41% since last week is the finding.
 */
export function ResultTable({ results, testID }: { results: LabResult[]; testID?: string }) {
  if (results.length === 0) {
    return (
      <Text variant="caption" tone="tertiary">
        No results entered.
      </Text>
    );
  }

  return (
    <VStack gap={0} testID={testID}>
      {results.map((r, i) => {
        const p = flagPresentation(r.flag);
        const s = p.level && r.flag !== "normal" ? signal[p.level] : null;
        return (
          <View
            key={r.code}
            style={[styles.row, i > 0 ? styles.divider : null]}
            testID={`result-${r.code}`}
            accessibilityLabel={`${r.name} ${r.valueText} ${r.unit}. ${p.label}.${r.rangeText ? ` Range ${r.rangeText}.` : ""}`}
          >
            <HStack gap={10} align="center" wrap>
              <Text variant="body-sm" style={styles.name}>
                {r.name}
              </Text>

              <HStack gap={6} align="center" style={styles.valueCell}>
                <Text
                  variant="label"
                  tabular
                  style={s ? { color: s.text } : undefined}
                  testID={`result-${r.code}-value`}
                >
                  {r.valueText}
                  {r.unit ? ` ${r.unit}` : ""}
                </Text>
                <LabFlagGlyph flag={r.flag} testID={`result-${r.code}-flag`} />
              </HStack>

              <VStack gap={0} style={styles.rangeCell}>
                <Text variant="caption" tone="tertiary">
                  {r.rangeText || (r.rangeNote ? "No range" : "")}
                </Text>
                {r.rangeNote ? (
                  <Text variant="caption" tone="tertiary">
                    {r.rangeNote}
                  </Text>
                ) : null}
              </VStack>
            </HStack>

            {r.delta?.significant ? (
              <HStack gap={4} align="center" style={styles.delta} testID={`result-${r.code}-delta`}>
                {r.delta.direction === "down" ? (
                  <TrendingDown size={13} color={signal.urgent.text} />
                ) : (
                  <TrendingUp size={13} color={signal.urgent.text} />
                )}
                <Text variant="caption" style={{ color: signal.urgent.text }}>
                  {r.delta.direction === "down" ? "Down" : "Up"}
                  {r.delta.percent !== null ? ` ${Math.abs(r.delta.percent)}%` : ""} from{" "}
                  {String(r.delta.previousValue)}
                  {r.delta.previousAt ? ` on ${formatDateTime(r.delta.previousAt)}` : ""}
                </Text>
              </HStack>
            ) : null}
          </View>
        );
      })}
    </VStack>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: palette.border.subtle },
  name: { flexBasis: 160, flexGrow: 1 },
  valueCell: { minWidth: 120 },
  rangeCell: { flexBasis: 150, flexGrow: 1 },
  delta: { marginTop: 4 },
});
