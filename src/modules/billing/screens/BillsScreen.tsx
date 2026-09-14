import React, { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { Receipt, FilePlus2, Clock } from "lucide-react-native";

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
  Skeleton,
  ErrorState,
  EmptyState,
  StatTile,
  Pagination,
} from "@shared/ui";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { formatDateTime, formatRupees } from "@shared/format";
import { useBills, useOutstanding } from "@modules/billing/hooks/useBilling";
import { BillStatusText } from "@modules/billing/components/BillStatusText";
import type { BillStatus } from "@modules/billing/types";

/** The bills — every state, newest first. */
export default function BillsScreen() {
  const navigation = useNavigation<any>();
  const canManage = useAuthStore((s) => s.hasPermission)(PERMISSIONS.BILLING_MANAGE);
  const [status, setStatus] = useState<"all" | BillStatus>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search, 300);

  const { data, isLoading, isError, error, refetch, isRefetching } = useBills({
    status: status === "all" ? undefined : status,
    search: debounced.trim() || undefined,
    page,
  });
  const { data: outstanding } = useOutstanding();
  const rows = data?.data ?? [];

  return (
    <Screen
      overline="Billing"
      title="Bills"
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="bills-screen"
      right={
        <HStack gap={8} wrap>
          {canManage ? (
            <Button label="Generate a bill" size="sm" icon={<FilePlus2 size={15} color="#FFFFFF" />} onPress={() => navigation.navigate("GenerateBill", {})} testID="open-generate" />
          ) : null}
          <Button label="Outstanding" size="sm" variant="secondary" icon={<Clock size={15} />} onPress={() => navigation.navigate("Outstanding")} testID="open-outstanding" />
        </HStack>
      }
    >
      <VStack gap={14}>
        <HStack gap={10} wrap>
          <StatTile label="Outstanding" value={formatRupees(outstanding?.total ?? 0)} icon={Receipt} attention={(outstanding?.total ?? 0) > 0} />
          <StatTile label="Unpaid bills" value={outstanding?.rows.length ?? 0} />
          <StatTile label="Over 90 days" value={formatRupees(outstanding?.buckets["90_plus"]?.amount ?? 0)} attention={(outstanding?.buckets["90_plus"]?.amount ?? 0) > 0} />
        </HStack>

        <SearchInput value={search} onChangeText={(v) => { setSearch(v); setPage(1); }} placeholder="Bill number, patient name, hospital number or mobile" testID="bills-search" />
        <ChipsRow
          chips={[
            { key: "all", label: "All" },
            { key: "draft", label: "Drafts" },
            { key: "finalised", label: "Unpaid" },
            { key: "partially_paid", label: "Partially paid" },
            { key: "paid", label: "Paid" },
            { key: "cancelled", label: "Cancelled" },
          ]}
          active={status}
          onChange={(k) => { setStatus(k as "all" | BillStatus); setPage(1); }}
        />

        {isLoading ? (
          <VStack gap={8}>
            <Skeleton height={64} />
            <Skeleton height={64} />
          </VStack>
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Receipt} title="No bills" message="Bills appear here once they are generated from a patient's charges." />
        ) : (
          <VStack gap={8} testID="bill-rows">
            {rows.map((b) => (
              <Card key={b.id} compact onPress={() => navigation.navigate("BillDetail", { billId: b.id })} testID={`bill-row-${b.billNumber}`}>
                <HStack gap={12} align="center" wrap>
                  <VStack gap={2} style={{ flex: 1, minWidth: 220 }}>
                    <HStack gap={8} align="center">
                      <Text variant="label">{b.billNumber}</Text>
                      <Text variant="caption" tone="tertiary">{b.billType === "ipd" ? "Inpatient" : "Outpatient"}</Text>
                    </HStack>
                    <Text variant="body-sm">
                      {b.patient.fullName} · {b.patient.patientId}
                    </Text>
                    <Text variant="caption" tone="tertiary">{formatDateTime(b.finalisedAt ?? b.createdAt)}</Text>
                  </VStack>
                  <VStack gap={2} align="flex-end">
                    <Text variant="label" tabular>{formatRupees(b.total)}</Text>
                    {b.balanceDue > 0 && b.status !== "draft" ? (
                      <Text variant="caption" tone="warning" tabular>{formatRupees(b.balanceDue)} due</Text>
                    ) : null}
                    <BillStatusText status={b.status} />
                  </VStack>
                </HStack>
              </Card>
            ))}
          </VStack>
        )}
        {data && data.meta.totalPages > 1 ? (
          <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} limit={30} onPageChange={setPage} label="bills" />
        ) : null}
      </VStack>
    </Screen>
  );
}
