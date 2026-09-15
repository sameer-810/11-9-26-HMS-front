import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Pill, TriangleAlert } from "lucide-react-native";

import { signal } from "@shared/designSystem";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  ChipsRow,
  SearchInput,
  Skeleton,
  ErrorState,
  EmptyState,
  StatTile,
} from "@shared/ui";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { useProgressiveList } from "@shared/hooks/useProgressiveList";
import { ShowMoreButton } from "@shared/ui/ShowMoreButton";
import { formatDateTime } from "@shared/format";
import { usePharmacyQueue } from "@modules/pharmacy/hooks/usePharmacy";
import { StockStatusBadge } from "@modules/inventory/components/StockBadges";
import { UrgencyBadge } from "@modules/laboratory/screens/LabQueueScreen";
import type { PharmacyQueueRow } from "@modules/pharmacy/types";

/**
 * PH-01: prescriptions waiting to be filled.
 *
 * Each row answers the two questions a pharmacist asks before opening one:
 * is the stock there (PH-02), and has anything changed about this patient's
 * allergies since the doctor wrote it. The second is flagged at the critical
 * tier — it is the case the whole counter check exists for.
 */
export default function PharmacyQueueScreen() {
  const navigation = useNavigation<any>();
  const [urgency, setUrgency] = useState("all");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);

  const { data = [], isLoading, isError, error, refetch, isRefetching } = usePharmacyQueue({
    urgency: urgency === "all" ? undefined : urgency,
    search: debounced.trim() || undefined,
  });

  const rows = useProgressiveList(data);
  const changed = data.filter((r) => r.allergiesChangedSinceWritten).length;
  const out = data.filter((r) => r.stockStatus === "out_of_stock").length;

  return (
    <Screen
      overline="Pharmacy"
      title="Prescriptions"
      subtitle="Most urgent first, then oldest"
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="pharmacy-queue"
    >
      <VStack gap={14}>
        <HStack gap={10} wrap>
          <StatTile label="Waiting" value={data.length} icon={Pill} />
          <StatTile label="Allergies changed" value={changed} attention={changed > 0} />
          <StatTile label="Something out of stock" value={out} attention={out > 0} />
        </HStack>

        <SearchInput value={search} onChangeText={setSearch} placeholder="Patient, hospital number or prescription number" />
        <ChipsRow
          chips={[
            { key: "all", label: "All" },
            { key: "stat", label: "STAT" },
            { key: "urgent", label: "Urgent" },
            { key: "routine", label: "Routine" },
          ]}
          active={urgency}
          onChange={setUrgency}
        />

        {isLoading ? (
          <VStack gap={10}>
            <Skeleton height={80} />
            <Skeleton height={80} />
          </VStack>
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.length === 0 ? (
          <EmptyState icon={Pill} title="Nothing to dispense" message="Prescriptions appear here as soon as a doctor saves them." />
        ) : (
          <VStack gap={8} testID="pharmacy-queue-rows">
            {rows.visible.map((row) => (
              <QueueRow key={row.id} row={row} onPress={() => navigation.navigate("Dispense", { prescriptionId: row.id })} />
            ))}
            <ShowMoreButton hidden={rows.hidden} pageSize={rows.pageSize} onPress={rows.showMore} noun="prescriptions" testID="pharmacy-queue-show-more" />
          </VStack>
        )}
      </VStack>
    </Screen>
  );
}

function QueueRow({ row, onPress }: { row: PharmacyQueueRow; onPress: () => void }) {
  const p = row.patient;
  return (
    <Card
      onPress={onPress}
      accentColor={row.allergiesChangedSinceWritten ? signal.critical.color : undefined}
      testID={`rx-row-${row.prescriptionNumber}`}
      accessibilityLabel={`${row.prescriptionNumber} for ${p.fullName}`}
    >
      <HStack gap={12} align="center" wrap>
        <VStack gap={4} style={styles.left}>
          <UrgencyBadge urgency={row.urgency} />
          <Text variant="caption" tone="tertiary">
            {formatDateTime(row.createdAt)}
          </Text>
        </VStack>

        <VStack gap={2} style={{ flex: 1, minWidth: 220 }}>
          <HStack gap={8} align="center" wrap>
            <Text variant="label-lg">{p.fullName}</Text>
            <Text variant="caption" tone="secondary">
              {p.patientId} · {p.age} · {p.gender}
            </Text>
          </HStack>
          <Text variant="body-sm" tone="secondary">
            {row.prescriptionNumber} · {row.lineCount} medicine{row.lineCount === 1 ? "" : "s"} · Dr {row.doctor.fullName}
          </Text>
          {!p.allergiesRecorded ? (
            <Text variant="caption" style={{ color: signal.caution.text }}>
              Allergies not recorded — ask before dispensing
            </Text>
          ) : p.allergies.length ? (
            <Text variant="caption" style={{ color: signal.critical.text }}>
              Allergic to {p.allergies.map((a) => a.substance).join(", ")}
            </Text>
          ) : null}
        </VStack>

        <VStack gap={4} align="flex-end">
          <StockStatusBadge status={row.stockStatus} />
          {row.allergiesChangedSinceWritten ? (
            <HStack gap={4} align="center" testID={`rx-allergy-changed-${row.prescriptionNumber}`}>
              <TriangleAlert size={13} color={signal.critical.text} />
              <Text variant="caption" style={{ color: signal.critical.text }}>
                Allergies changed since prescribed
              </Text>
            </HStack>
          ) : null}
        </VStack>
      </HStack>
    </Card>
  );
}

const styles = StyleSheet.create({ left: { minWidth: 90 } });
