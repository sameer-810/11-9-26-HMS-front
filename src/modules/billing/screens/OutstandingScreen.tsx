import React from "react";
import { useNavigation } from "@react-navigation/native";
import { Receipt } from "lucide-react-native";

import { Screen, Text, VStack, HStack, Card, Skeleton, ErrorState, EmptyState, StatTile } from "@shared/ui";
import { formatRupees } from "@shared/format";
import { useProgressiveList } from "@shared/hooks/useProgressiveList";
import { ShowMoreButton } from "@shared/ui/ShowMoreButton";
import { useOutstanding } from "@modules/billing/hooks/useBilling";
import { BillStatusText } from "@modules/billing/components/BillStatusText";
import type { AgingBucket } from "@modules/billing/types";

const BUCKETS: AgingBucket[] = ["0_30", "31_60", "61_90", "90_plus"];

/** BL-05 outstanding bills, oldest first, with ageing buckets. */
export default function OutstandingScreen() {
  const navigation = useNavigation<any>();
  const { data, isLoading, isError, error, refetch, isRefetching } = useOutstanding();
  const rows = useProgressiveList(data?.rows ?? []);

  return (
    <Screen overline="Billing" title="Outstanding bills" subtitle="Oldest first" refreshing={isRefetching} onRefresh={refetch} testID="outstanding-screen">
      {isLoading ? (
        <Skeleton height={200} />
      ) : isError || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <VStack gap={14}>
          <HStack gap={10} wrap>
            <StatTile label="Total outstanding" value={formatRupees(data.total)} icon={Receipt} attention={data.total > 0} />
            {BUCKETS.map((b) => (
              <StatTile key={b} label={data.buckets[b].label} value={formatRupees(data.buckets[b].amount)} attention={b === "90_plus" && data.buckets[b].amount > 0} />
            ))}
          </HStack>
          {data.rows.length === 0 ? (
            <EmptyState icon={Receipt} title="Nothing outstanding" />
          ) : (
            <VStack gap={8} testID="outstanding-rows">
              {rows.visible.map((r) => (
                <Card key={r.id} compact onPress={() => navigation.navigate("BillDetail", { billId: r.id })} testID={`outstanding-${r.billNumber}`}>
                  <HStack gap={12} align="center" wrap>
                    <VStack gap={2} style={{ flex: 1, minWidth: 220 }}>
                      <Text variant="label">{r.patient.fullName}</Text>
                      <Text variant="caption" tone="secondary">
                        {r.patient.patientId} · {r.patient.mobile} · {r.billNumber}
                      </Text>
                    </VStack>
                    <VStack gap={2} align="flex-end">
                      <Text variant="label" tabular>{formatRupees(r.balanceDue)} due</Text>
                      <Text variant="caption" tone={r.bucket === "90_plus" ? "danger" : "tertiary"}>
                        {r.ageDays} day{r.ageDays === 1 ? "" : "s"} · {r.bucketLabel}
                      </Text>
                      <BillStatusText status={r.status} />
                    </VStack>
                  </HStack>
                </Card>
              ))}
              <ShowMoreButton hidden={rows.hidden} pageSize={rows.pageSize} onPress={rows.showMore} noun="bills" testID="outstanding-show-more" />
            </VStack>
          )}
        </VStack>
      )}
    </Screen>
  );
}
