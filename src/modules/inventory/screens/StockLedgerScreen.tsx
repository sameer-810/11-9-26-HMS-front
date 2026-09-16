import React, { useState } from "react";
import { View, StyleSheet } from "react-native";

import { palette, signal } from "@shared/designSystem";
import { Screen, Text, VStack, HStack, Card, ChipsRow, Skeleton, ErrorState, EmptyState, Pagination } from "@shared/ui";
import { formatDateTime } from "@shared/format";
import { useStockMovements } from "@modules/inventory/hooks/useInventory";
import { MOVEMENT_LABELS, type MovementType } from "@modules/inventory/types";

/**
 * stock ledger: every movement in and out, read-only at the model.
 * a dispensed movement names its prescription number, never its patient.
 */
export default function StockLedgerScreen() {
  const [type, setType] = useState<"all" | MovementType>("all");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch, isRefetching } = useStockMovements({
    type: type === "all" ? undefined : type,
    page,
  });
  const rows = data?.data ?? [];

  return (
    <Screen overline="Stock" title="Stock ledger" subtitle="Every movement in and out, kept for ever" refreshing={isRefetching} onRefresh={refetch} testID="stock-ledger">
      <VStack gap={12}>
        <ChipsRow
          chips={[{ key: "all", label: "All" }, ...(Object.keys(MOVEMENT_LABELS) as MovementType[]).map((k) => ({ key: k, label: MOVEMENT_LABELS[k] }))]}
          active={type}
          onChange={(k) => {
            setType(k as "all" | MovementType);
            setPage(1);
          }}
        />
        {isLoading ? (
          <Skeleton height={200} />
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : rows.length === 0 ? (
          <EmptyState title="No movements" />
        ) : (
          <Card>
            <VStack gap={0}>
              {rows.map((m) => (
                <View key={m.id} style={styles.row} testID={`ledger-${m.reference}-${m.batchNumber}-${m.type}`}>
                  <HStack gap={10} align="center" wrap>
                    <Text variant="label" tabular style={{ minWidth: 64, color: m.quantityChange > 0 ? signal.normal.text : palette.text.primary }}>
                      {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                    </Text>
                    <VStack gap={1} style={{ flex: 1, minWidth: 240 }}>
                      <Text variant="body-sm">
                        {MOVEMENT_LABELS[m.type]} · {m.itemName} · batch {m.batchNumber} · {m.locationLabel} · balance {m.balanceAfter}
                      </Text>
                      <Text variant="caption" tone="tertiary">
                        {m.reference} · {formatDateTime(m.at)} · {m.performedByName}
                        {m.supplierName ? ` · ${m.supplierName} ${m.invoiceNumber}` : ""}
                        {m.departmentName ? ` · to ${m.departmentName}, received by ${m.receivedByName}` : ""}
                        {m.prescriptionNumber ? ` · ${m.prescriptionNumber}` : ""}
                        {m.reason ? ` · ${m.reason}` : ""}
                      </Text>
                    </VStack>
                  </HStack>
                </View>
              ))}
            </VStack>
          </Card>
        )}
        {data && data.meta.totalPages > 1 ? (
          <Pagination
            page={page}
            totalPages={data.meta.totalPages}
            total={data.meta.total}
            totalCapped={data.meta.totalCapped}
            limit={50}
            onPageChange={setPage}
            label="movements"
          />
        ) : null}
      </VStack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: palette.border.subtle },
});
