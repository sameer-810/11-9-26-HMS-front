import React from "react";
import { View, StyleSheet } from "react-native";
import { palette } from "@shared/designSystem";
import { Text, VStack, HStack, Button } from "@shared/ui";
import { formatRupees } from "@shared/format";
import { CATEGORY_LABELS, type Charge, type ChargeCategory } from "@modules/billing/types";

/**
 * Itemised charges, grouped the way a bill is read: consultation, room,
 * laboratory, pharmacy, procedures.
 *
 * Each line says what produced it — a consultation number, a bed and its
 * dates, a lab order, a dispensing record — so a patient disputing a charge can
 * be answered from the line itself. Nothing on it is clinical: no diagnosis,
 * no indication, no result.
 */
const ORDER: ChargeCategory[] = ["consultation", "room", "laboratory", "pharmacy", "procedure"];

export function ChargeTable({
  lines,
  onRemove,
  testID,
}: {
  lines: Charge[];
  onRemove?: (line: Charge) => void;
  testID?: string;
}) {
  if (lines.length === 0) {
    return (
      <Text variant="caption" tone="tertiary">
        No charges.
      </Text>
    );
  }

  return (
    <VStack gap={12} testID={testID}>
      {ORDER.filter((c) => lines.some((l) => l.category === c)).map((category) => {
        const group = lines.filter((l) => l.category === category);
        const subtotal = group.reduce((n, l) => n + l.amount, 0);
        return (
          <VStack key={category} gap={0}>
            <HStack justify="space-between" style={styles.groupHeader}>
              <Text variant="overline" tone="secondary">
                {CATEGORY_LABELS[category]}
              </Text>
              <Text variant="label-sm" tabular tone="secondary">
                {formatRupees(subtotal)}
              </Text>
            </HStack>
            {group.map((l) => (
              <View key={l.id ?? l.sourceKey} style={styles.row} testID={`charge-${l.description}`}>
                <HStack gap={10} align="center" wrap>
                  <VStack gap={1} style={{ flex: 1, minWidth: 200 }}>
                    <Text variant="body-sm">{l.description}</Text>
                    <Text variant="caption" tone="tertiary">
                      {[l.detail, l.serviceDate].filter(Boolean).join(" · ")}
                    </Text>
                  </VStack>
                  <Text variant="caption" tone="secondary" tabular style={styles.qty}>
                    {l.quantity} {l.unit}
                    {l.unitPrice !== null ? ` × ${formatRupees(l.unitPrice)}` : ""}
                  </Text>
                  <VStack gap={0} align="flex-end" style={styles.amount}>
                    {l.unpriced ? (
                      <Text variant="label-sm" tone="danger" testID={`charge-unpriced-${l.description}`}>
                        Not priced
                      </Text>
                    ) : (
                      <Text variant="label" tabular>
                        {formatRupees(l.amount)}
                      </Text>
                    )}
                    {l.tax ? (
                      <Text variant="caption" tone="tertiary" tabular>
                        + {formatRupees(l.tax)} tax ({l.taxRate}%)
                      </Text>
                    ) : null}
                  </VStack>
                  {onRemove && l.id ? (
                    <Button label="Remove" size="xs" variant="ghost" onPress={() => onRemove(l)} testID={`remove-${l.description}`} />
                  ) : null}
                </HStack>
              </View>
            ))}
          </VStack>
        );
      })}
    </VStack>
  );
}

const styles = StyleSheet.create({
  groupHeader: { paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: palette.border.default },
  row: { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: palette.border.subtle },
  qty: { minWidth: 110, textAlign: "right" },
  amount: { minWidth: 100 },
});
