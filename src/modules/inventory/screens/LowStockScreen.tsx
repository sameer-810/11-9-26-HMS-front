import React from "react";
import { useNavigation } from "@react-navigation/native";
import { PackageCheck } from "lucide-react-native";

import { signal } from "@shared/designSystem";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  SectionHeader,
  Skeleton,
  ErrorState,
  EmptyState,
} from "@shared/ui";
import { useLowStock } from "@modules/inventory/hooks/useInventory";
import { useStockMode } from "@modules/inventory/StockMode";
import { ExpiryBadge } from "@modules/inventory/components/StockBadges";

/**
 * low stock and expiry alerts.
 * three lists, because they take three different actions: order, use first, dispose.
 */
export default function LowStockScreen() {
  const navigation = useNavigation<any>();
  const { location } = useStockMode();
  const { data, isLoading, isError, error, refetch, isRefetching } =
    useLowStock();

  if (isLoading || !data) {
    return (
      <Screen title="Low stock and expiry">
        {isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <Skeleton height={200} />
        )}
      </Screen>
    );
  }

  const inScope = <T extends { location: string }>(list: T[]) =>
    location ? list.filter((b) => b.location === location) : list;
  const expired = inScope(data.expired);
  const expiring = inScope(data.expiring);
  const open = (itemId: string) =>
    navigation.navigate("InventoryItem", { itemId });

  return (
    <Screen
      overline="Stock"
      title="Low stock and expiry"
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="low-stock"
    >
      <VStack gap={14}>
        <Card
          accentColor={expired.length ? signal.critical.color : undefined}
          testID="expired-list"
        >
          <SectionHeader
            title="Expired, still on the shelf"
            subtitle="Cannot be dispensed or issued. Dispose of them with a reason."
          />
          {expired.length === 0 ? (
            <Text variant="caption" tone="tertiary">
              None.
            </Text>
          ) : (
            <VStack gap={8}>
              {expired.map((b) => (
                <Card
                  key={b.id}
                  compact
                  onPress={() => open(b.itemId)}
                  testID={`expired-${b.batchNumber}`}
                >
                  <HStack gap={10} align="center" wrap>
                    <Text variant="label" style={{ flex: 1 }}>
                      {b.item?.name} · batch {b.batchNumber} · {b.locationLabel}
                    </Text>
                    <ExpiryBadge
                      status={b.expiryStatus}
                      date={b.expiryDate}
                      days={b.daysToExpiry}
                    />
                    <Text variant="label" tabular>
                      {b.quantityOnHand}
                    </Text>
                  </HStack>
                </Card>
              ))}
            </VStack>
          )}
        </Card>

        <Card testID="low-list">
          <SectionHeader title="At or below the reorder level" />
          {data.low.length === 0 ? (
            <EmptyState icon={PackageCheck} title="Nothing is running low" />
          ) : (
            <VStack gap={8}>
              {data.low.map((item) => (
                <Card
                  key={item.id}
                  compact
                  onPress={() => open(item.id)}
                  accentColor={signal.urgent.color}
                  testID={`low-${item.code}`}
                >
                  <HStack gap={10} align="center" wrap>
                    <VStack gap={1} style={{ flex: 1 }}>
                      <Text variant="label">{item.name}</Text>
                      <Text variant="caption" tone="tertiary">
                        {item.code}
                      </Text>
                    </VStack>
                    <Text
                      variant="label"
                      tabular
                      style={{ color: signal.urgent.text }}
                    >
                      {item.stock.totalUsable} usable · reorder at{" "}
                      {item.reorderLevel}
                    </Text>
                  </HStack>
                </Card>
              ))}
            </VStack>
          )}
        </Card>

        <Card testID="expiring-list">
          <SectionHeader
            title="Expiring in the next 90 days"
            subtitle="Use these first"
          />
          {expiring.length === 0 ? (
            <Text variant="caption" tone="tertiary">
              None.
            </Text>
          ) : (
            <VStack gap={6}>
              {expiring.map((b) => (
                <HStack key={b.id} gap={10} align="center" wrap>
                  <Text variant="body-sm" style={{ flex: 1 }}>
                    {b.item?.name} · batch {b.batchNumber} · {b.locationLabel}
                  </Text>
                  <ExpiryBadge
                    status={b.expiryStatus}
                    date={b.expiryDate}
                    days={b.daysToExpiry}
                  />
                  <Text variant="label-sm" tabular>
                    {b.quantityOnHand}
                  </Text>
                </HStack>
              ))}
            </VStack>
          )}
        </Card>
      </VStack>
    </Screen>
  );
}
