import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useRoute } from "@react-navigation/native";

import { palette, signal } from "@shared/designSystem";
import { useAuthStore } from "@shared/store/useAuthStore";
import { PERMISSIONS } from "@shared/permissions";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  SectionHeader,
  Button,
  TextField,
  Banner,
  Skeleton,
  ErrorState,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { formatDateTime, formatRupees } from "@shared/format";
import { useInventoryItem, useUpdateItem, useDisposeStock } from "@modules/inventory/hooks/useInventory";
import { useStockMode } from "@modules/inventory/StockMode";
import { ExpiryBadge } from "@modules/inventory/components/StockBadges";
import { MOVEMENT_LABELS, type StockBatch } from "@modules/inventory/types";

/**
 * one item: its batches in each location, and its ledger.
 * no quantity field by design — a count changes only through a recorded movement.
 */
export default function ItemDetailScreen() {
  const route = useRoute<any>();
  const { itemId } = (route.params ?? {}) as { itemId: string };
  const { location } = useStockMode();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canPrice = hasPermission(PERMISSIONS.HOSPITAL_CONFIG);
  const canEdit = hasPermission(PERMISSIONS.INVENTORY_MANAGE) || canPrice;
  const canDispose = hasPermission(PERMISSIONS.INVENTORY_MANAGE) || hasPermission(PERMISSIONS.PHARMACY_DISPENSE);

  const { data, isLoading, isError, error, refetch, isRefetching } = useInventoryItem(itemId);

  if (isLoading || !data) {
    return (
      <Screen title="Item">
        {isError ? <ErrorState error={error} onRetry={refetch} /> : <Skeleton height={160} />}
      </Screen>
    );
  }

  const { item, movements } = data;
  const batches = location ? data.batches.filter((b) => b.location === location) : data.batches;

  return (
    <Screen
      overline={item.code}
      title={item.name}
      subtitle={item.medicine ? `${item.medicine.genericName} · ${item.medicine.strength} ${item.medicine.form}` : item.category}
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="item-detail"
    >
      <VStack gap={14}>
        {canEdit ? <ItemSettings key={`${item.unitPrice}-${item.reorderLevel}`} itemId={item.id} unitPrice={item.unitPrice} reorderLevel={item.reorderLevel} canPrice={canPrice} /> : (
          <Card>
            <Text variant="body-sm" tone="secondary">
              Price {item.unitPrice === null ? "not set" : formatRupees(item.unitPrice)} per {item.unit} · reorder at {item.reorderLevel}
            </Text>
          </Card>
        )}

        <Card testID="item-batches">
          <SectionHeader title="Batches" subtitle="Soonest expiry first. Expired batches cannot be dispensed or issued." />
          {batches.length === 0 ? (
            <Text variant="caption" tone="tertiary">
              No batches yet.
            </Text>
          ) : (
            <VStack gap={0}>
              {batches.map((b) => (
                <BatchRow key={b.id} batch={b} unit={item.unit} canDispose={canDispose && b.quantityOnHand > 0 && (!location || b.location === location)} />
              ))}
            </VStack>
          )}
        </Card>

        <Card testID="item-movements">
          <SectionHeader title="Movements" subtitle="Every change to this item's stock, newest first" />
          <VStack gap={0}>
            {movements.map((m) => (
              <View key={m.id} style={styles.row}>
                <HStack gap={10} align="center" wrap>
                  <Text variant="label-sm" tabular style={{ minWidth: 60, color: m.quantityChange > 0 ? signal.normal.text : palette.text.primary }}>
                    {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                  </Text>
                  <VStack gap={1} style={{ flex: 1, minWidth: 220 }}>
                    <Text variant="body-sm">
                      {MOVEMENT_LABELS[m.type]} · {m.locationLabel} · batch {m.batchNumber} · balance {m.balanceAfter}
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
      </VStack>
    </Screen>
  );
}

function ItemSettings({ itemId, unitPrice, reorderLevel, canPrice }: { itemId: string; unitPrice: number | null; reorderLevel: number; canPrice: boolean }) {
  const [price, setPrice] = useState(unitPrice === null ? "" : String(unitPrice));
  const [reorder, setReorder] = useState(String(reorderLevel));
  const update = useUpdateItem(itemId);

  const save = () => {
    const patch: { reorderLevel?: number; unitPrice?: number | null } = {};
    if (Number(reorder) !== reorderLevel) patch.reorderLevel = Math.max(0, Math.floor(Number(reorder) || 0));
    if (canPrice) {
      const next = price.trim() === "" ? null : Number(price);
      if (next !== unitPrice && (next === null || Number.isFinite(next))) patch.unitPrice = next;
    }
    if (Object.keys(patch).length) update.mutate(patch);
  };

  return (
    <Card testID="item-settings">
      <VStack gap={10}>
        <HStack gap={10} wrap>
          <TextField label="Reorder level" numericField value={reorder} onChangeText={setReorder} containerStyle={{ flex: 1, minWidth: 140 }} testID="item-reorder" />
          {canPrice ? (
            <TextField
              label="Price per unit"
              numericField
              suffix="₹"
              value={price}
              onChangeText={setPrice}
              hint="Leave empty for not priced. Only administration sets prices."
              containerStyle={{ flex: 1, minWidth: 160 }}
              testID="item-price"
            />
          ) : (
            <View style={{ flex: 1, minWidth: 160, justifyContent: "center" }}>
              <Text variant="caption" tone="tertiary">
                Price {unitPrice === null ? "not set" : formatRupees(unitPrice)} — set by administration
              </Text>
            </View>
          )}
        </HStack>
        {update.isError ? <Banner tone="danger" message={apiErrorMessage(update.error)} /> : null}
        <Button label="Save" size="sm" variant="secondary" loading={update.isPending} onPress={save} testID="item-save" />
      </VStack>
    </Card>
  );
}

function BatchRow({ batch: b, unit, canDispose }: { batch: StockBatch; unit: string; canDispose: boolean }) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(String(b.quantityOnHand));
  const [reason, setReason] = useState(b.expiryStatus === "expired" ? "Expired on the shelf" : "");
  const dispose = useDisposeStock();

  return (
    <View style={styles.row} testID={`item-batch-${b.batchNumber}-${b.location}`}>
      <HStack gap={10} align="center" wrap>
        <VStack gap={2} style={{ flex: 1, minWidth: 200 }}>
          <Text variant="label-sm">
            {b.batchNumber} · {b.locationLabel}
          </Text>
          <ExpiryBadge status={b.expiryStatus} date={b.expiryDate} days={b.daysToExpiry} />
        </VStack>
        <Text variant="label" tabular>
          {b.quantityOnHand} {unit}
        </Text>
        {canDispose && !open ? (
          <Button
            label="Dispose"
            size="xs"
            variant={b.expiryStatus === "expired" ? "destructive" : "ghost"}
            onPress={() => setOpen(true)}
            testID={`dispose-open-${b.batchNumber}`}
          />
        ) : null}
      </HStack>
      {open ? (
        <VStack gap={8} style={{ marginTop: 8 }}>
          <HStack gap={10} wrap>
            <TextField label="Quantity" numericField value={quantity} onChangeText={setQuantity} containerStyle={{ width: 120 }} />
            <TextField label="Reason" value={reason} onChangeText={setReason} containerStyle={{ flex: 1, minWidth: 200 }} testID={`dispose-reason-${b.batchNumber}`} />
          </HStack>
          {dispose.isError ? <Banner tone="danger" message={apiErrorMessage(dispose.error)} /> : null}
          <HStack gap={8}>
            <Button
              label="Remove from stock"
              size="sm"
              variant="destructive"
              disabled={reason.trim().length < 5 || !(Number(quantity) > 0)}
              loading={dispose.isPending}
              onPress={() =>
                dispose.mutate({ batchId: b.id, quantity: Math.floor(Number(quantity)), reason: reason.trim() }, { onSuccess: () => setOpen(false) })
              }
              testID={`dispose-submit-${b.batchNumber}`}
            />
            <Button label="Cancel" size="sm" variant="ghost" onPress={() => setOpen(false)} />
          </HStack>
        </VStack>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: palette.border.subtle },
});
