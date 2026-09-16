import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  FlaskConical,
  Clock,
  RotateCcw,
  OctagonAlert,
} from "lucide-react-native";

import { palette, signal } from "@shared/designSystem";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  ChipsRow,
  SearchInput,
  SignalBadge,
  Skeleton,
  ErrorState,
  EmptyState,
  StatTile,
} from "@shared/ui";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { useProgressiveList } from "@shared/hooks/useProgressiveList";
import { ShowMoreButton } from "@shared/ui/ShowMoreButton";
import { formatDuration, formatTimeOnly } from "@shared/format";
import { useLabQueue } from "@modules/laboratory/hooks/useLaboratory";
import type {
  LabQueueRow,
  LabStatus,
  LabUrgency,
} from "@modules/laboratory/types";
import type { PatientBanner } from "@modules/patient/types";

/**
 * laboratory queue, ordered by the server: unreported criticals, then stat, urgent, routine, oldest first.
 * age is shown against each test's own turnaround target.
 */
const FILTERS: { key: "active" | LabStatus; label: string }[] = [
  { key: "active", label: "All active" },
  { key: "requested", label: "To collect" },
  { key: "sample_collected", label: "Collected" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "To report" },
];

export function UrgencyBadge({ urgency }: { urgency: LabUrgency }) {
  if (urgency === "stat")
    return <SignalBadge level="critical" label="STAT" size="sm" />;
  if (urgency === "urgent")
    return <SignalBadge level="urgent" label="Urgent" size="sm" />;
  return (
    <Text variant="label-sm" tone="tertiary">
      Routine
    </Text>
  );
}

export default function LabQueueScreen() {
  const navigation = useNavigation<any>();
  const [filter, setFilter] = useState<"active" | LabStatus>("active");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);

  const {
    data = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useLabQueue({
    status: filter === "active" ? undefined : filter,
    search: debounced.trim() || undefined,
  });

  const rows = useProgressiveList(data);
  const stat = data.filter((r) => r.urgency === "stat").length;
  const overdue = data.filter((r) => r.turnaround.overdue).length;
  const criticalToReport = data.filter(
    (r) => r.status === "completed" && r.hasCritical,
  ).length;

  return (
    <Screen
      overline="Laboratory"
      title="Test queue"
      subtitle="Most urgent first, then oldest"
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="lab-queue"
    >
      <VStack gap={14}>
        <HStack gap={10} wrap>
          <StatTile
            label="In the queue"
            value={data.length}
            icon={FlaskConical}
          />
          <StatTile label="STAT" value={stat} attention={stat > 0} />
          <StatTile
            label="Past turnaround"
            value={overdue}
            attention={overdue > 0}
          />
          <StatTile
            label="Critical, not reported"
            value={criticalToReport}
            attention={criticalToReport > 0}
          />
        </HStack>

        <SearchInput
          value={search}
          onChangeText={setSearch}
          placeholder="Patient name, hospital number, order or sample number"
        />
        <ChipsRow
          chips={FILTERS.map((f) => ({ key: f.key, label: f.label }))}
          active={filter}
          onChange={(k) => setFilter(k as "active" | LabStatus)}
        />

        {isLoading ? (
          <VStack gap={10}>
            <Skeleton height={76} />
            <Skeleton height={76} />
            <Skeleton height={76} />
          </VStack>
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="Nothing waiting"
            message={
              search
                ? "No request matches that search."
                : "New requests appear here as soon as a doctor orders them."
            }
          />
        ) : (
          <VStack gap={8} testID="lab-queue-rows">
            {rows.visible.map((row) => (
              <QueueRow
                key={row.id}
                row={row}
                onPress={() =>
                  navigation.navigate("LabOrder", { orderId: row.id })
                }
              />
            ))}
            <ShowMoreButton
              hidden={rows.hidden}
              pageSize={rows.pageSize}
              onPress={rows.showMore}
              noun="tests"
              testID="lab-queue-show-more"
            />
          </VStack>
        )}
      </VStack>
    </Screen>
  );
}

function QueueRow({ row, onPress }: { row: LabQueueRow; onPress: () => void }) {
  const patient = row.patient as PatientBanner;
  const criticalWaiting = row.status === "completed" && row.hasCritical;
  const late = row.turnaround.overdue;

  return (
    <Card
      onPress={onPress}
      accentColor={
        criticalWaiting
          ? signal.critical.color
          : row.urgency === "stat"
            ? signal.urgent.color
            : undefined
      }
      testID={`lab-row-${row.orderNumber}`}
      accessibilityLabel={`${row.testName} for ${patient?.fullName ?? "patient"}, ${row.statusLabel}, ${row.urgency}`}
    >
      <HStack gap={12} align="center" wrap>
        <VStack gap={4} style={styles.urgencyCell}>
          <UrgencyBadge urgency={row.urgency} />
          <Text variant="caption" tone="tertiary" tabular>
            {formatTimeOnly(row.requestedAt)}
          </Text>
        </VStack>

        <VStack gap={2} style={{ flex: 1, minWidth: 200 }}>
          <HStack gap={8} align="center" wrap>
            <Text variant="label-lg">{row.testName}</Text>
            <Text variant="caption" tone="tertiary">
              {row.sampleType}
              {row.sampleId ? ` · ${row.sampleId}` : ""}
            </Text>
          </HStack>
          <Text variant="body-sm">
            {patient?.fullName} · {patient?.patientId} · {patient?.age} ·{" "}
            {patient?.gender}
          </Text>
          <Text variant="caption" tone="tertiary">
            {row.orderNumber} · ordered by {row.doctorName}
          </Text>
        </VStack>

        <VStack gap={4} align="flex-end" style={styles.statusCell}>
          {criticalWaiting ? (
            <HStack gap={4} align="center">
              <OctagonAlert size={14} color={signal.critical.text} />
              <Text variant="label-sm" style={{ color: signal.critical.text }}>
                Critical — report now
              </Text>
            </HStack>
          ) : (
            <Text variant="label-sm">{row.statusLabel}</Text>
          )}
          <HStack gap={4} align="center">
            <Clock
              size={12}
              color={late ? signal.urgent.text : palette.text.tertiary}
            />
            <Text
              variant="caption"
              tabular
              style={late ? { color: signal.urgent.text } : undefined}
              tone={late ? undefined : "tertiary"}
            >
              {formatDuration(row.turnaround.ageMinutes)} of{" "}
              {formatDuration(row.turnaround.targetMinutes)}
              {late ? " · late" : ""}
            </Text>
          </HStack>
          {row.rejections > 0 ? (
            <HStack gap={4} align="center">
              <RotateCcw size={12} color={signal.caution.text} />
              <Text variant="caption" style={{ color: signal.caution.text }}>
                Recollect
              </Text>
            </HStack>
          ) : null}
        </VStack>
      </HStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  urgencyCell: { minWidth: 70 },
  statusCell: { minWidth: 150 },
});
