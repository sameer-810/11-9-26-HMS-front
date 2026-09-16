import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";

import { palette } from "@shared/designSystem";
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
  Select,
  Banner,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import {
  useInventoryItems,
  useSuppliers,
  useCreateSupplier,
  useReceiveStock,
} from "@modules/inventory/hooks/useInventory";
import { useStockMode } from "@modules/inventory/StockMode";
import { parseExpiry, formatExpiry } from "@modules/inventory/utils/expiry";
import { LOCATION_LABELS, type StockLocation } from "@modules/inventory/types";

/**
 * record stock received against a supplier and invoice.
 * expiry is typed as printed on the pack and parsed while typing; a two-digit year is refused.
 */
interface Line {
  key: number;
  itemId: string | null;
  batchNumber: string;
  expiry: string;
  quantity: string;
  unitCost: string;
}

let nextKey = 1;
const blankLine = (): Line => ({
  key: nextKey++,
  itemId: null,
  batchNumber: "",
  expiry: "",
  quantity: "",
  unitCost: "",
});

export default function ReceiveStockScreen() {
  const { mode, receiveLocations } = useStockMode();
  const canAddSupplier = useAuthStore((s) => s.hasPermission)(
    PERMISSIONS.INVENTORY_MANAGE,
  );

  const [location, setLocation] = useState<StockLocation>(receiveLocations[0]);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [invoice, setInvoice] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [blankLine()]);
  const [newSupplier, setNewSupplier] = useState("");

  const { data: itemsResult } = useInventoryItems(
    mode === "pharmacy" ? { category: "medicine" } : {},
  );
  const { data: suppliers = [] } = useSuppliers();
  const createSupplier = useCreateSupplier();
  const receive = useReceiveStock();

  const items = itemsResult?.data ?? [];
  const update = (key: number, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    if (receive.isSuccess || receive.isError) receive.reset();
  };

  const lineErrors = lines.map((l) => {
    if (
      !l.itemId ||
      !l.batchNumber.trim() ||
      !l.expiry.trim() ||
      !l.quantity.trim()
    )
      return "incomplete";
    if (!parseExpiry(l.expiry)) return "expiry";
    if (!Number.isInteger(Number(l.quantity)) || Number(l.quantity) <= 0)
      return "quantity";
    return null;
  });
  const ready =
    supplierId && invoice.trim() && lineErrors.every((e) => e === null);

  const submit = () =>
    receive.mutate(
      {
        location,
        supplierId: supplierId!,
        invoiceNumber: invoice.trim(),
        lines: lines.map((l) => ({
          itemId: l.itemId!,
          batchNumber: l.batchNumber.trim(),
          expiry: l.expiry.trim(),
          quantity: Number(l.quantity),
          unitCost: l.unitCost.trim() ? Number(l.unitCost) : undefined,
        })),
      },
      {
        onSuccess: () => {
          setLines([blankLine()]);
          setInvoice("");
        },
      },
    );

  return (
    <Screen
      overline={mode === "pharmacy" ? "Pharmacy" : "Store"}
      title="Receive stock"
      subtitle="Against a supplier's invoice"
      testID="receive-stock"
    >
      <VStack gap={14}>
        {receive.isSuccess ? (
          <View testID="receive-success">
            <Banner
              tone="success"
              title={`${receive.data.reference} recorded`}
              message={`${receive.data.movements.length} line(s) received into ${LOCATION_LABELS[location]}.${receive.data.warnings.length ? ` ${receive.data.warnings.join(" ")}` : ""}`}
            />
          </View>
        ) : null}
        {receive.isError ? (
          <View testID="receive-error">
            <Banner
              tone="danger"
              title="Nothing was received"
              message={apiErrorMessage(receive.error)}
            />
          </View>
        ) : null}

        <Card>
          <VStack gap={10}>
            <SectionHeader title="Delivery" />
            {receiveLocations.length > 1 ? (
              <Select
                label="Receive into"
                value={location}
                onChange={(v) => setLocation(v as StockLocation)}
                options={receiveLocations.map((l) => ({
                  value: l,
                  label: LOCATION_LABELS[l],
                }))}
              />
            ) : (
              <Text variant="body-sm" tone="secondary">
                Receiving into the {LOCATION_LABELS[location].toLowerCase()}
              </Text>
            )}
            <Select
              label="Supplier"
              value={supplierId}
              onChange={setSupplierId}
              options={suppliers.map((s) => ({
                value: s.id,
                label: s.name,
                sublabel: s.gstin,
              }))}
              placeholder="Choose the supplier"
            />
            {canAddSupplier ? (
              <HStack gap={8} align="flex-end" wrap>
                <TextField
                  label="Or add a supplier"
                  value={newSupplier}
                  onChangeText={setNewSupplier}
                  containerStyle={{ flex: 1, minWidth: 200 }}
                  testID="new-supplier-name"
                />
                <Button
                  label="Add"
                  size="sm"
                  variant="secondary"
                  disabled={newSupplier.trim().length < 2}
                  loading={createSupplier.isPending}
                  onPress={() =>
                    createSupplier.mutate(
                      { name: newSupplier.trim() },
                      {
                        onSuccess: (s) => {
                          setSupplierId(s.id);
                          setNewSupplier("");
                        },
                      },
                    )
                  }
                  testID="new-supplier-submit"
                />
              </HStack>
            ) : null}
            <TextField
              label="Invoice number"
              required
              value={invoice}
              onChangeText={setInvoice}
              testID="receive-invoice"
            />
          </VStack>
        </Card>

        {lines.map((l, i) => {
          const parsed = l.expiry.trim() ? parseExpiry(l.expiry) : null;
          return (
            <Card key={l.key} testID={`receive-line-${i}`}>
              <VStack gap={10}>
                <HStack justify="space-between" align="center">
                  <Text variant="label">Line {i + 1}</Text>
                  {lines.length > 1 ? (
                    <Button
                      label="Remove"
                      size="xs"
                      variant="ghost"
                      icon={<Trash2 size={13} />}
                      onPress={() =>
                        setLines((ls) => ls.filter((x) => x.key !== l.key))
                      }
                    />
                  ) : null}
                </HStack>
                <Select
                  label="Item"
                  value={l.itemId}
                  onChange={(v) => update(l.key, { itemId: v })}
                  options={items.map((it) => ({
                    value: it.id,
                    label: it.name,
                    sublabel: it.code,
                  }))}
                  placeholder="Choose the item"
                />
                <HStack gap={10} wrap>
                  <TextField
                    label="Batch number"
                    value={l.batchNumber}
                    onChangeText={(v) => update(l.key, { batchNumber: v })}
                    containerStyle={styles.field}
                    testID={`receive-batch-${i}`}
                  />
                  <TextField
                    label="Expiry"
                    placeholder="MM/YYYY"
                    value={l.expiry}
                    onChangeText={(v) => update(l.key, { expiry: v })}
                    hint={
                      parsed
                        ? `Usable until ${formatExpiry(parsed)}`
                        : "As printed on the pack, with a four-digit year"
                    }
                    error={
                      l.expiry.trim() && !parsed
                        ? "Use MM/YYYY or YYYY-MM-DD — a two-digit year is not accepted"
                        : undefined
                    }
                    containerStyle={styles.field}
                    testID={`receive-expiry-${i}`}
                  />
                  <TextField
                    label="Quantity"
                    numericField
                    value={l.quantity}
                    onChangeText={(v) => update(l.key, { quantity: v })}
                    containerStyle={styles.field}
                    testID={`receive-qty-${i}`}
                  />
                  <TextField
                    label="Unit cost"
                    numericField
                    suffix="₹"
                    value={l.unitCost}
                    onChangeText={(v) => update(l.key, { unitCost: v })}
                    containerStyle={styles.field}
                  />
                </HStack>
              </VStack>
            </Card>
          );
        })}

        <HStack gap={8} wrap>
          <Button
            label="Add another line"
            variant="ghost"
            icon={<Plus size={14} />}
            onPress={() => setLines((ls) => [...ls, blankLine()])}
          />
          <Button
            label="Record receipt"
            onPress={submit}
            disabled={!ready}
            loading={receive.isPending}
            testID="receive-submit"
          />
        </HStack>
        <Text variant="caption" style={{ color: palette.text.tertiary }}>
          Expired batches are refused, and a batch number already held with a
          different expiry is refused.
        </Text>
      </VStack>
    </Screen>
  );
}

const styles = StyleSheet.create({ field: { flex: 1, minWidth: 150 } });
