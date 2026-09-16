import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Boxes, PackagePlus, PackageMinus, TriangleAlert, ScrollText } from "lucide-react-native";

import { signal } from "@shared/designSystem";
import { useAuthStore } from "@shared/store/useAuthStore";
import { PERMISSIONS } from "@shared/permissions";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  ChipsRow,
  SearchInput,
  Button,
  Banner,
  Select,
  TextField,
  SectionHeader,
  Skeleton,
  ErrorState,
  EmptyState,
  StatTile,
  SignalBadge,
} from "@shared/ui";
import { apiClient, apiErrorMessage } from "@api/apiClient";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { useProgressiveList } from "@shared/hooks/useProgressiveList";
import { ShowMoreButton } from "@shared/ui/ShowMoreButton";
import { useInventoryItems, useCreateItem, useLowStock } from "@modules/inventory/hooks/useInventory";
import { useStockMode } from "@modules/inventory/StockMode";
import { formatExpiry } from "@modules/inventory/utils/expiry";
import type { InventoryItem, ItemCategory } from "@modules/inventory/types";

/**
 * stock at a glance: the store's inventory, or the pharmacy's shelf.
 * usable and expired stock are separate columns and are never summed.
 */
export default function InventoryScreen() {
  const navigation = useNavigation<any>();
  const { mode, location, canIssue } = useStockMode();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission(PERMISSIONS.INVENTORY_MANAGE);
  const canMove = hasPermission(PERMISSIONS.INVENTORY_MANAGE) || hasPermission(PERMISSIONS.PHARMACY_DISPENSE);

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);

  const { data, isLoading, isError, error, refetch, isRefetching } = useInventoryItems({
    search: debounced.trim() || undefined,
    category: filter === "medicine" || filter === "consumable" ? (filter as ItemCategory) : mode === "pharmacy" ? "medicine" : undefined,
    location: location ?? undefined,
    lowOnly: filter === "low",
  });
  const { data: alerts } = useLowStock();
  const rows = data?.data ?? [];
  const shown = useProgressiveList(rows);

  return (
    <Screen
      overline={mode === "pharmacy" ? "Pharmacy" : "Store"}
      title={mode === "pharmacy" ? "Medicine stock" : "Inventory"}
      subtitle={mode === "pharmacy" ? "What is on the pharmacy shelf" : "Every item, in every location"}
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="inventory-screen"
      right={
        <HStack gap={8} wrap>
          {canMove ? (
            <Button label="Receive stock" size="sm" icon={<PackagePlus size={15} color="#FFFFFF" />} onPress={() => navigation.navigate("ReceiveStock")} testID="open-receive" />
          ) : null}
          {canIssue && canMove ? (
            <Button label="Issue stock" size="sm" variant="secondary" icon={<PackageMinus size={15} />} onPress={() => navigation.navigate("IssueStock")} testID="open-issue" />
          ) : null}
        </HStack>
      }
    >
      <VStack gap={14}>
        <HStack gap={10} wrap>
          <StatTile label="Items" value={rows.length} icon={Boxes} />
          <StatTile label="Low stock" value={alerts?.low.length ?? 0} attention={(alerts?.low.length ?? 0) > 0} />
          <StatTile label="Expiring in 90 days" value={alerts?.expiring.length ?? 0} />
          <StatTile label="Expired on the shelf" value={alerts?.expired.length ?? 0} attention={(alerts?.expired.length ?? 0) > 0} />
        </HStack>

        <HStack gap={8} wrap>
          <Button label="Low stock and expiry" size="sm" variant="secondary" icon={<TriangleAlert size={14} />} onPress={() => navigation.navigate("LowStock")} testID="open-low-stock" />
          <Button label="Stock ledger" size="sm" variant="ghost" icon={<ScrollText size={14} />} onPress={() => navigation.navigate("StockLedger")} testID="open-ledger" />
        </HStack>

        {canCreate ? <NewItemForm /> : null}

        <SearchInput value={search} onChangeText={setSearch} placeholder="Item name or code" testID="inventory-search" />
        <ChipsRow
          chips={[
            { key: "all", label: "All" },
            { key: "low", label: "Low stock" },
            ...(mode === "store" ? [{ key: "medicine", label: "Medicines" }, { key: "consumable", label: "Consumables" }] : []),
          ]}
          active={filter}
          onChange={setFilter}
        />

        {isLoading ? (
          <VStack gap={8}>
            <Skeleton height={64} />
            <Skeleton height={64} />
          </VStack>
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Boxes} title="No items" message={search ? "Nothing matches that search." : "Items appear here once they are added."} />
        ) : (
          <VStack gap={8} testID="inventory-rows">
            {shown.visible.map((item) => (
              <ItemRow key={item.id} item={item} pharmacyOnly={mode === "pharmacy"} onPress={() => navigation.navigate("InventoryItem", { itemId: item.id })} />
            ))}
            <ShowMoreButton hidden={shown.hidden} pageSize={shown.pageSize} onPress={shown.showMore} noun="items" testID="inventory-show-more" />
          </VStack>
        )}
      </VStack>
    </Screen>
  );
}

function ItemRow({ item, pharmacyOnly, onPress }: { item: InventoryItem; pharmacyOnly: boolean; onPress: () => void }) {
  const store = item.stock.byLocation.main_store;
  const pharmacy = item.stock.byLocation.pharmacy;
  const expired = pharmacyOnly ? pharmacy?.expired ?? 0 : item.stock.totalExpired;

  return (
    <Card compact onPress={onPress} accentColor={item.low ? signal.urgent.color : undefined} testID={`item-row-${item.code}`}>
      <HStack gap={12} align="center" wrap>
        <VStack gap={2} style={{ flex: 1, minWidth: 200 }}>
          <HStack gap={8} align="center" wrap>
            <Text variant="label">{item.name}</Text>
            <Text variant="caption" tone="tertiary">
              {item.code}
            </Text>
            {item.low ? <SignalBadge level="urgent" label="Low stock" size="sm" /> : null}
          </HStack>
          <Text variant="caption" tone="tertiary">
            Reorder at {item.reorderLevel} · next expiry {formatExpiry(item.stock.nextExpiry)}
          </Text>
        </VStack>

        <HStack gap={16} align="center">
          {!pharmacyOnly ? <Qty label="Store" value={store?.usable ?? 0} unit={item.unit} /> : null}
          <Qty label="Pharmacy" value={pharmacy?.usable ?? 0} unit={item.unit} testID={`item-${item.code}-pharmacy`} />
          {expired > 0 ? (
            <VStack gap={0} style={styles.qty}>
              <Text variant="caption" style={{ color: signal.critical.text }}>
                Expired
              </Text>
              <Text variant="label" tabular style={{ color: signal.critical.text }} testID={`item-${item.code}-expired`}>
                {expired}
              </Text>
            </VStack>
          ) : null}
        </HStack>
      </HStack>
    </Card>
  );
}

function Qty({ label, value, unit, testID }: { label: string; value: number; unit: string; testID?: string }) {
  return (
    <VStack gap={0} style={styles.qty}>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
      <Text variant="label" tabular testID={testID}>
        {value} <Text variant="caption" tone="tertiary">{unit}</Text>
      </Text>
    </VStack>
  );
}

/** a medicine item is linked to its formulary entry; that link is how dispensing finds stock. */
function NewItemForm() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ItemCategory>("medicine");
  const [medicineSearch, setMedicineSearch] = useState("");
  const [medicineId, setMedicineId] = useState<string | null>(null);
  const [unit, setUnit] = useState("tablet");
  const [reorder, setReorder] = useState("0");
  const create = useCreateItem();
  const debounced = useDebouncedValue(medicineSearch, 300);

  const { data: medicines = [] } = useQuery({
    queryKey: ["formulary-search", debounced],
    queryFn: async () =>
      (await apiClient.get<{ data: { id: string; label: string }[] }>("/prescriptions/medicines", { params: { search: debounced, limit: 20 } })).data.data,
    enabled: open && category === "medicine" && debounced.trim().length >= 2,
  });

  if (!open) {
    return <Button label="Add an item" variant="ghost" size="sm" onPress={() => setOpen(true)} testID="open-new-item" />;
  }

  const ready = code.trim().length >= 2 && name.trim().length >= 2 && (category !== "medicine" || medicineId);

  return (
    <Card testID="new-item-form">
      <VStack gap={10}>
        <SectionHeader title="New item" />
        <Select
          label="Category"
          value={category}
          onChange={(v) => setCategory(v as ItemCategory)}
          options={[
            { value: "medicine", label: "Medicine" },
            { value: "consumable", label: "Consumable" },
            { value: "surgical", label: "Surgical" },
            { value: "equipment", label: "Equipment" },
            { value: "other", label: "Other" },
          ]}
        />
        {category === "medicine" ? (
          <>
            <SearchInput value={medicineSearch} onChangeText={setMedicineSearch} placeholder="Find the medicine in the formulary" />
            {medicines.length ? (
              <Select
                label="Medicine"
                value={medicineId}
                onChange={(v) => {
                  setMedicineId(v);
                  if (!name) setName(medicines.find((m) => m.id === v)?.label ?? "");
                }}
                options={medicines.map((m) => ({ value: m.id, label: m.label }))}
                placeholder="Choose the medicine"
              />
            ) : null}
          </>
        ) : null}
        <HStack gap={10} wrap>
          <TextField label="Code" value={code} onChangeText={setCode} testID="new-item-code" containerStyle={{ flex: 1, minWidth: 140 }} />
          <TextField label="Unit" value={unit} onChangeText={setUnit} containerStyle={{ flex: 1, minWidth: 120 }} />
          <TextField label="Reorder level" numericField value={reorder} onChangeText={setReorder} containerStyle={{ flex: 1, minWidth: 120 }} />
        </HStack>
        <TextField label="Name" value={name} onChangeText={setName} testID="new-item-name" />
        {create.isError ? <Banner tone="danger" message={apiErrorMessage(create.error)} /> : null}
        <HStack gap={8}>
          <Button
            label="Add item"
            disabled={!ready}
            loading={create.isPending}
            onPress={() =>
              create.mutate(
                {
                  code: code.trim(),
                  name: name.trim(),
                  category,
                  medicineId: category === "medicine" ? medicineId ?? undefined : undefined,
                  unit: unit.trim() || "unit",
                  reorderLevel: Math.max(0, Number(reorder) || 0),
                },
                { onSuccess: () => setOpen(false) },
              )
            }
            testID="new-item-submit"
          />
          <Button label="Cancel" variant="ghost" onPress={() => setOpen(false)} />
        </HStack>
      </VStack>
    </Card>
  );
}

const styles = StyleSheet.create({ qty: { minWidth: 70, alignItems: "flex-end" } });
