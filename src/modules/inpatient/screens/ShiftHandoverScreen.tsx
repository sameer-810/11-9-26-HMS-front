import React, { useMemo, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { ClipboardList } from "lucide-react-native";

import { signal, type SignalLevel } from "@shared/designSystem";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  Button,
  ChipsRow,
  Skeleton,
  ErrorState,
  EmptyState,
  SignalBadge,
} from "@shared/ui";
import { formatDateTime, formatTimeOnly } from "@shared/format";
import { statusLabel } from "@shared/utils/statusLabels";
import {
  useMyPatients,
  useHandoversForMany,
} from "@modules/inpatient/hooks/useInpatient";
import {
  SHIFT_ORDER,
  handoverStatusFor,
  latestShiftStart,
  shiftAt,
  type HandoverStatus,
} from "@modules/inpatient/shifts";
import type { AdmissionRow, Shift } from "@modules/inpatient/types";
import type { PatientBanner } from "@modules/patient/types";

/**
 * Shift handover: for the nurse's own patients (the My ward scope), whether this shift's
 * SBAR handover has been given and taken. Giving it happens on each chart's Notes tab.
 */
export default function ShiftHandoverScreen() {
  const navigation = useNavigation<any>();
  // Read once per render; the list refetches every minute, which moves "now" along with it.
  const now = new Date();
  const [shift, setShift] = useState<Shift>(() => shiftAt(new Date()));
  const current = shiftAt(now);

  const patients = useMyPatients();
  const rows: AdmissionRow[] = useMemo(
    () => patients.data?.data ?? [],
    [patients.data],
  );
  const handovers = useHandoversForMany(rows.map((r) => r.id));

  const statuses = rows.map((row, i) => {
    const q = handovers[i];
    return {
      row,
      loading: q?.isLoading ?? true,
      error: q?.isError ?? false,
      status: q?.data ? handoverStatusFor(q.data, shift, now) : null,
    };
  });
  const counts = statuses.reduce(
    (acc, s) => {
      if (s.status) acc[s.status.kind] += 1;
      return acc;
    },
    { none: 0, waiting: 0, taken: 0 },
  );

  const start = latestShiftStart(shift, now);
  const startedToday = start.toDateString() === now.toDateString();

  return (
    <Screen
      overline="Wards"
      title="Shift handover"
      subtitle="Your patients: allocated to you by name, and everyone on your wards"
      scroll
      refreshing={patients.isRefetching}
      onRefresh={() => {
        patients.refetch();
        handovers.forEach((q) => q.refetch());
      }}
      testID="shift-handover"
    >
      <VStack gap={14}>
        <ChipsRow
          chips={SHIFT_ORDER.map((s) => ({
            key: s,
            label: `${statusLabel(s)}${s === current ? " (now)" : ""}`,
          }))}
          active={shift}
          onChange={(k) => setShift(k as Shift)}
        />
        <Text variant="caption" tone="tertiary" testID="handover-window">
          {statusLabel(shift)} shift handovers given since{" "}
          {formatTimeOnly(start.toISOString())}{" "}
          {startedToday ? "today" : "yesterday"}.
        </Text>

        {patients.isLoading ? (
          <VStack gap={10}>
            <Skeleton height={72} />
            <Skeleton height={72} />
          </VStack>
        ) : patients.isError ? (
          <ErrorState
            error={patients.error}
            onRetry={() => patients.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No patients allocated to you yet"
            message="The charge nurse allocates patients at the start of the shift. Their handovers appear here."
          />
        ) : (
          <>
            <Text variant="body-sm" tone="secondary" testID="handover-counts">
              {counts.none} not yet given · {counts.waiting} waiting to be
              taken · {counts.taken} taken
            </Text>
            <VStack gap={10} testID="handover-list">
              {statuses.map(({ row, loading, error, status }) => (
                <HandoverRow
                  key={row.id}
                  row={row}
                  loading={loading}
                  error={error}
                  status={status}
                  onOpen={() =>
                    navigation.navigate("Bedside", {
                      admissionId: row.id,
                      tab: "notes",
                    })
                  }
                />
              ))}
            </VStack>
          </>
        )}
      </VStack>
    </Screen>
  );
}

const STATUS_COPY: Record<
  HandoverStatus["kind"],
  { label: string; level: SignalLevel }
> = {
  none: { label: "Not yet given this shift", level: "caution" },
  waiting: { label: "Given, waiting to be taken", level: "urgent" },
  taken: { label: "Taken", level: "normal" },
};

function HandoverRow({
  row,
  loading,
  error,
  status,
  onOpen,
}: {
  row: AdmissionRow;
  loading: boolean;
  error: boolean;
  status: HandoverStatus | null;
  onOpen: () => void;
}) {
  const patient = row.patient as PatientBanner;
  const name = patient?.fullName ?? row.admissionNumber;
  const copy = status ? STATUS_COPY[status.kind] : null;

  return (
    <Card
      testID={`handover-row-${row.admissionNumber}`}
      accentColor={status?.kind === "none" ? signal.caution.color : undefined}
    >
      <HStack gap={12} align="center" wrap>
        <VStack gap={2} style={{ minWidth: 88 }}>
          <Text variant="label" tabular numberOfLines={1}>
            {row.bed?.number ?? "—"}
          </Text>
          <Text variant="caption" tone="tertiary" numberOfLines={2}>
            {row.ward?.name ?? ""}
          </Text>
        </VStack>

        <VStack gap={4} style={{ flex: 1, minWidth: 200 }}>
          <Text variant="label-lg">{name}</Text>
          {loading ? (
            <Text variant="caption" tone="tertiary">
              Checking handovers…
            </Text>
          ) : error ? (
            <Text variant="caption" style={{ color: signal.critical.text }}>
              Handovers could not be loaded. Pull to refresh.
            </Text>
          ) : copy && status ? (
            <VStack gap={2} testID={`handover-status-${row.admissionNumber}`}>
              <HStack gap={6} align="center" wrap>
                <SignalBadge
                  level={copy.level}
                  label={
                    status.kind === "taken"
                      ? `Taken by ${status.handover.receivedBy || "the next shift"}`
                      : copy.label
                  }
                  size="sm"
                />
              </HStack>
              {status.kind !== "none" ? (
                <Text variant="caption" tone="tertiary">
                  {statusLabel(status.handover.fromShift)} →{" "}
                  {statusLabel(status.handover.toShift)} · given by{" "}
                  {status.handover.givenBy} at{" "}
                  {formatDateTime(status.handover.givenAt)}
                  {status.kind === "taken" && status.handover.receivedAt
                    ? ` · taken at ${formatTimeOnly(status.handover.receivedAt)}`
                    : ""}
                </Text>
              ) : null}
            </VStack>
          ) : null}
        </VStack>

        <Button
          label={
            status?.kind === "none" ? "Give handover" : "Open notes & handover"
          }
          size="sm"
          variant={status?.kind === "none" ? "primary" : "secondary"}
          fullWidth={false}
          onPress={onOpen}
          accessibilityHint={`Opens ${name}'s chart on the Notes and handover tab`}
          testID={`handover-open-${row.admissionNumber}`}
        />
      </HStack>
    </Card>
  );
}
