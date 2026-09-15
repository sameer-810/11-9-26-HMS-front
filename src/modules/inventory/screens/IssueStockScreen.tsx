import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Trash2 } from "lucide-react-native";

import { palette, radius, signal, layout } from "@shared/designSystem";
import { Screen, Text, VStack, HStack, Card, SectionHeader, Button, TextField, Select, Banner } from "@shared/ui";
import { checkable } from "@shared/ui/a11y";
import { apiErrorMessage } from "@api/apiClient";
import { useDepartments } from "@modules/appointment/hooks/useDirectory";
import { useInventoryItems, useInventoryItem, useIssueStock } from "@modules/inventory/hooks/useInventory";
import { formatExpiry } from "@modules/inventory/utils/expiry";
import { LOCATION_LABELS, type StockLocation } from "@modules/inventory/types";

/**
 * IN-02: stock issued to a department, or transferred to the pharmacy.
 *
 * Batches are chosen from the batches that exist, with expired ones listed and
 * locked — "Expired" is the reason shown, not a missing row that makes the
 * store hunt for a box they can see. Quantities cannot exceed what a batch
 * holds; the server refuses it too, and it is the server's refusal that holds
 * when two people issue the last box at once.
 */

interface Line {
  batchId: string;
  itemName: string;
  batchNumber: string;
  expiryDate: string;
  max: number;
  quantity: string;
}

export default function IssueStockScreen() {
  const [from, setFrom] = useState<StockLocation>("main_store");
  const [destination, setDestination] = useState<"department" | "pharmacy">("department");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [receivedBy, setReceivedBy] = useState("");
  const [note, setNote] = useState("");
  const [itemId, setItemId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  const { data: departments = [] } = useDepartments();
  const { data: itemsResult } = useInventoryItems({ location: from });
  const { data: detail } = useInventoryItem(itemId ?? undefined);
  const issue = useIssueStock();

  const items = (itemsResult?.data ?? []).filter((i) => (i.stock.byLocation[from]?.usable ?? 0) > 0 || (i.stock.byLocation[from]?.expired ?? 0) > 0);
  const batches = (detail?.batches ?? []).filter((b) => b.location === from && b.quantityOnHand > 0);
  const toPharmacy = destination === "pharmacy" && from === "main_store";

  const reset = () => {
    if (issue.isSuccess || issue.isError) issue.reset();
  };

  const lineProblems = lines.map((l) => {
    const n = Number(l.quantity);
    if (!l.quantity.trim()) return "Enter a quantity";
    if (!Number.isInteger(n) || n <= 0) return "Whole units only";
    if (n > l.max) return `Only ${l.max} in this batch`;
    return null;
  });
  const ready =
    lines.length > 0 &&
    lineProblems.every((p) => p === null) &&
    receivedBy.trim().length >= 2 &&
    (toPharmacy || Boolean(departmentId));

  const submit = () =>
    issue.mutate(
      {
        fromLocation: from,
        destination: toPharmacy ? { type: "pharmacy" } : { type: "department", departmentId: departmentId! },
        receivedByName: receivedBy.trim(),
        note: note.trim() || undefined,
        lines: lines.map((l) => ({ batchId: l.batchId, quantity: Number(l.quantity) })),
      },
      { onSuccess: () => setLines([]) },
    );

  return (
    <Screen overline="Store" title="Issue stock" subtitle="To a department, or to the pharmacy" testID="issue-stock">
      <VStack gap={14}>
        {issue.isSuccess ? (
          <View testID="issue-success">
            <Banner tone="success" title={`${issue.data.reference} recorded`} message={`${issue.data.movements.length} movement(s) written to the ledger.`} />
          </View>
        ) : null}
        {issue.isError ? (
          <View testID="issue-error">
            <Banner tone="danger" title="Nothing was issued" message={apiErrorMessage(issue.error)} />
          </View>
        ) : null}

        <Card>
          <VStack gap={10}>
            <SectionHeader title="From and to" />
            <Select
              label="Issue from"
              value={from}
              onChange={(v) => {
                setFrom(v as StockLocation);
                setLines([]);
                setItemId(null);
                reset();
              }}
              options={(["main_store", "pharmacy"] as StockLocation[]).map((l) => ({ value: l, label: LOCATION_LABELS[l] }))}
            />
            <HStack gap={8}>
              {(["department", "pharmacy"] as const).map((d) => {
                const disabled = d === "pharmacy" && from !== "main_store";
                const active = destination === d && !disabled;
                return (
                  <Pressable
                    key={d}
                    disabled={disabled}
                    onPress={() => setDestination(d)}
                    style={[styles.choice, active ? styles.choiceOn : null, disabled ? { opacity: 0.5 } : null]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active, disabled }}
                    {...checkable(active, () => setDestination(d), disabled)}
                    testID={`issue-to-${d}`}
                  >
                    <Text variant="label">{d === "department" ? "A department" : "Transfer to the pharmacy"}</Text>
                  </Pressable>
                );
              })}
            </HStack>
            {!toPharmacy ? (
              <Select
                label="Receiving department"
                value={departmentId}
                onChange={setDepartmentId}
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                placeholder="Choose the department"
              />
            ) : null}
            <TextField
              label="Received by"
              required
              hint="The person taking the stock. Your name is recorded as the issuer."
              value={receivedBy}
              onChangeText={setReceivedBy}
              testID="issue-received-by"
            />
            <TextField label="Note" value={note} onChangeText={setNote} />
          </VStack>
        </Card>

        <Card>
          <VStack gap={10}>
            <SectionHeader title="What" />
            <Select
              label="Item"
              value={itemId}
              onChange={setItemId}
              options={items.map((i) => ({ value: i.id, label: i.name, sublabel: `${i.stock.byLocation[from]?.usable ?? 0} usable` }))}
              placeholder="Choose an item"
            />
            {itemId && batches.length ? (
              <Select
                label="Batch"
                value={null}
                onChange={(batchId) => {
                  const b = batches.find((x) => x.id === batchId);
                  if (!b || lines.some((l) => l.batchId === batchId)) return;
                  setLines((ls) => [
                    ...ls,
                    { batchId: b.id, itemName: detail?.item.name ?? "", batchNumber: b.batchNumber, expiryDate: b.expiryDate, max: b.quantityOnHand, quantity: "" },
                  ]);
                  reset();
                }}
                options={batches.map((b) => ({
                  value: b.id,
                  label: `Batch ${b.batchNumber} · exp ${formatExpiry(b.expiryDate)}`,
                  sublabel: `${b.quantityOnHand} on hand`,
                  disabled: !b.selectable,
                  disabledReason: b.expiryStatus === "expired" ? "Expired — cannot be issued" : undefined,
                }))}
                placeholder="Add a batch"
                hint="Soonest expiry first. Expired batches are shown and cannot be chosen."
              />
            ) : null}

            {lines.map((l, i) => (
              <View key={l.batchId} style={styles.line} testID={`issue-line-${l.batchNumber}`}>
                <HStack gap={10} align="center" wrap>
                  <VStack gap={1} style={{ flex: 1, minWidth: 180 }}>
                    <Text variant="label-sm">{l.itemName}</Text>
                    <Text variant="caption" tone="tertiary">
                      Batch {l.batchNumber} · exp {formatExpiry(l.expiryDate)} · {l.max} on hand
                    </Text>
                  </VStack>
                  <TextField
                    label="Quantity"
                    numericField
                    value={l.quantity}
                    onChangeText={(v) => {
                      setLines((ls) => ls.map((x) => (x.batchId === l.batchId ? { ...x, quantity: v } : x)));
                      reset();
                    }}
                    error={l.quantity.trim() && lineProblems[i] ? lineProblems[i]! : undefined}
                    containerStyle={{ width: 140 }}
                    testID={`issue-qty-${l.batchNumber}`}
                  />
                  <Button label="" size="xs" variant="ghost" icon={<Trash2 size={14} color={palette.text.tertiary} />} onPress={() => setLines((ls) => ls.filter((x) => x.batchId !== l.batchId))} />
                </HStack>
              </View>
            ))}
          </VStack>
        </Card>

        <Button label={toPharmacy ? "Transfer to the pharmacy" : "Issue stock"} onPress={submit} disabled={!ready} loading={issue.isPending} testID="issue-submit" />
        <Text variant="caption" style={{ color: signal.caution.text }}>
          Issuing more than a batch holds is refused. Every issue is written to the stock ledger with both names.
        </Text>
      </VStack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  choice: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.default,
  },
  choiceOn: { borderColor: palette.border.focus, backgroundColor: palette.surface.secondary },
  line: { paddingTop: 8, borderTopWidth: 1, borderTopColor: palette.border.subtle },
});
