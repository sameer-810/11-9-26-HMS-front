import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  UserCheck,
  UserX,
  Clock,
  Stethoscope,
  ListOrdered,
  TriangleAlert,
  ShieldAlert,
} from "lucide-react-native";

import { palette, radius, signal } from "@shared/designSystem";
import { useAuthStore } from "@shared/store/useAuthStore";
import { PERMISSIONS } from "@shared/permissions";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Button,
  Card,
  ChipsRow,
  StatusChip,
  Banner,
  Skeleton,
  ErrorState,
  EmptyState,
  Select,
  ConfirmDialog,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { formatWallTime, formatDuration, formatCalendarDate, todayCalendarDate } from "@shared/format";
import { useDepartments } from "@modules/appointment/hooks/useDirectory";
import {
  useOpdQueue,
  useMarkArrived,
  useMarkNoShow,
} from "@modules/appointment/hooks/useAppointments";
import type { Appointment } from "@modules/appointment/types";
import type { PatientBanner } from "@modules/patient/types";

/**
 * The OPD queue board — Flow 1 step 4 and AP-03.
 *
 * Ordered by the server to match the waiting room: whoever is with the doctor,
 * then the people waiting in token order, then those expected later. Left open
 * on a screen all shift, so it refetches itself rather than waiting to be
 * pulled.
 */
export default function OpdQueueScreen() {
  const navigation = useNavigation<any>();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManageQueue = hasPermission(PERMISSIONS.OPD_QUEUE_MANAGE);
  const seesClinical = hasPermission(PERMISSIONS.RECORD_VIEW);

  const [filter, setFilter] = useState("waiting");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [noShowTarget, setNoShowTarget] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = todayCalendarDate();
  const { data: departments } = useDepartments();
  const { data, isLoading, isError, error: loadError, refetch, isRefetching } = useOpdQueue({
    date: today,
    ...(departmentId ? { departmentId } : {}),
  });

  const markArrived = useMarkArrived();
  const markNoShow = useMarkNoShow();

  const all = data?.data ?? [];
  const counts = data?.meta?.counts;

  const visible = all.filter((a) => {
    if (filter === "waiting") return a.status === "arrived" || a.status === "in_consultation";
    if (filter === "expected") return a.status === "scheduled";
    if (filter === "done") return ["completed", "no_show", "cancelled"].includes(a.status);
    return true;
  });

  const arrive = async (a: Appointment) => {
    setError(null);
    try {
      await markArrived.mutateAsync(a.id);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not mark them arrived"));
    }
  };

  const confirmNoShow = async () => {
    if (!noShowTarget) return;
    setError(null);
    try {
      await markNoShow.mutateAsync(noShowTarget.id);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not update that appointment"));
    } finally {
      setNoShowTarget(null);
    }
  };

  return (
    <Screen
      overline="Front office"
      title="OPD queue"
      subtitle={formatCalendarDate(today)}
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="opd-queue"
    >
      <VStack gap={14}>
        {error ? <Banner tone="danger" message={error} onDismiss={() => setError(null)} /> : null}

        {counts ? (
          <HStack gap={10} wrap>
            <CountTile label="Waiting" value={counts.arrived} accent={palette.warning.text} />
            <CountTile
              label="With the doctor"
              value={counts.in_consultation}
              accent={palette.clinical[600]}
            />
            <CountTile label="Expected" value={counts.scheduled} accent={palette.text.tertiary} />
            <CountTile label="Seen" value={counts.completed} accent={signal.normal.text} />
            {counts.no_show > 0 ? (
              <CountTile label="Did not attend" value={counts.no_show} accent={palette.danger.text} />
            ) : null}
          </HStack>
        ) : null}

        <HStack gap={10} wrap align="center">
          <View style={{ flex: 1, minWidth: 220 }}>
            <ChipsRow
              chips={[
                { key: "waiting", label: "Waiting", count: (counts?.arrived ?? 0) + (counts?.in_consultation ?? 0) },
                { key: "expected", label: "Expected", count: counts?.scheduled },
                { key: "done", label: "Done" },
                { key: "all", label: "Everyone" },
              ]}
              active={filter}
              onChange={setFilter}
            />
          </View>
          <View style={{ minWidth: 200 }}>
            <Select
              value={departmentId}
              placeholder="All departments"
              options={[
                { value: "", label: "All departments" },
                ...(departments ?? []).map((d) => ({ value: d.id, label: d.name })),
              ]}
              onChange={(v) => setDepartmentId(v || null)}
            />
          </View>
        </HStack>

        {isError ? (
          <ErrorState error={loadError} title="Couldn't load the queue" onRetry={refetch} />
        ) : isLoading ? (
          <VStack gap={8}>
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} compact>
                <Skeleton width="70%" height={16} />
              </Card>
            ))}
          </VStack>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ListOrdered}
            title={
              filter === "waiting"
                ? "Nobody is waiting"
                : filter === "expected"
                  ? "Nobody else is expected today"
                  : "Nothing here"
            }
            message={
              filter === "waiting"
                ? "Patients appear here once reception marks them arrived."
                : undefined
            }
          />
        ) : (
          <VStack gap={8}>
            {visible.map((a) => (
              <QueueRow
                key={a.id}
                appointment={a}
                seesClinical={seesClinical}
                canManageQueue={canManageQueue}
                busy={markArrived.isPending || markNoShow.isPending}
                onArrive={() => arrive(a)}
                onNoShow={() => setNoShowTarget(a)}
                onOpen={() => {
                  const p = a.patient as PatientBanner;
                  if (p?.id) navigation.navigate("PatientDetail", { id: p.id });
                }}
              />
            ))}
          </VStack>
        )}
      </VStack>

      <ConfirmDialog
        visible={Boolean(noShowTarget)}
        title="Mark as did not attend?"
        message={`${(noShowTarget?.patient as PatientBanner)?.fullName ?? "This patient"} will be recorded as not having come. The slot is freed and the appointment cannot be reopened.`}
        confirmLabel="Did not attend"
        destructive
        loading={markNoShow.isPending}
        onConfirm={confirmNoShow}
        onCancel={() => setNoShowTarget(null)}
      />
    </Screen>
  );
}

function QueueRow({
  appointment: a,
  seesClinical,
  canManageQueue,
  busy,
  onArrive,
  onNoShow,
  onOpen,
}: {
  appointment: Appointment;
  seesClinical: boolean;
  canManageQueue: boolean;
  busy: boolean;
  onArrive: () => void;
  onNoShow: () => void;
  onOpen: () => void;
}) {
  const patient = a.patient as PatientBanner;
  const severe = (patient?.allergies ?? []).some(
    (x) => x.severity === "severe" || x.severity === "anaphylaxis",
  );
  const notRecorded = patient?.allergiesRecorded === false;

  // A long wait is an operational fact the desk should see without doing
  // arithmetic. Forty minutes is when people start asking at the counter.
  const longWait = (a.waitingMinutes ?? 0) >= 40;

  return (
    <Card
      onPress={onOpen}
      compact
      accentColor={severe ? signal.critical.color : undefined}
      testID={`queue-row-${a.appointmentNumber}`}
    >
      <HStack gap={12} align="center" wrap>
        {/* Token — the number the waiting room is called by. */}
        <View style={[styles.token, a.tokenNumber ? styles.tokenIssued : styles.tokenPending]}>
          <Text
            variant="metric-sm"
            tabular
            style={{ color: a.tokenNumber ? palette.clinical[700] : palette.text.disabled }}
          >
            {a.tokenNumber ?? "—"}
          </Text>
        </View>

        <VStack gap={3} flex={1} style={{ minWidth: 180 }}>
          <HStack gap={7} align="center" wrap>
            <Text variant="label-lg" tone="primary" numberOfLines={1}>
              {patient?.fullName ?? "Unknown patient"}
            </Text>
            {seesClinical && severe ? (
              <TriangleAlert
                size={14}
                color={signal.critical.color}
                strokeWidth={2.4}
                accessibilityLabel="Severe allergy recorded"
              />
            ) : null}
            {seesClinical && notRecorded ? (
              <ShieldAlert
                size={13}
                color={palette.warning.text}
                strokeWidth={2.2}
                accessibilityLabel="Allergies not recorded"
              />
            ) : null}
          </HStack>
          <Text variant="caption" tone="tertiary" tabular numberOfLines={1}>
            {patient?.patientId} · {patient?.age} · {patient?.gender}
            {a.reason ? ` · ${a.reason}` : ""}
          </Text>
        </VStack>

        <VStack gap={3} style={{ minWidth: 110 }}>
          <HStack gap={5} align="center">
            <Clock size={13} color={palette.text.tertiary} strokeWidth={2} />
            <Text variant="label-sm" tone="secondary" tabular>
              {formatWallTime(a.scheduledTime)}
            </Text>
          </HStack>
          {a.waitingMinutes !== null ? (
            <Text
              variant="caption"
              tabular
              style={{ color: longWait ? palette.warning.text : palette.text.tertiary }}
            >
              waiting {formatDuration(a.waitingMinutes)}
            </Text>
          ) : null}
        </VStack>

        <VStack gap={4} style={{ minWidth: 130 }}>
          <StatusChip status={a.status.replace("_", " ")} size="sm" />
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {(a.doctor as { fullName?: string })?.fullName ?? ""}
          </Text>
        </VStack>

        {canManageQueue && a.status === "scheduled" ? (
          <HStack gap={6} wrap>
            <Button
              label="Arrived"
              size="sm"
              fullWidth={false}
              disabled={busy}
              onPress={onArrive}
              testID={`arrive-${a.appointmentNumber}`}
              icon={<UserCheck size={14} color="#FFFFFF" strokeWidth={2.2} />}
            />
            <Button
              label="No show"
              variant="secondary"
              size="sm"
              fullWidth={false}
              disabled={busy}
              onPress={onNoShow}
              icon={<UserX size={14} color={palette.text.primary} strokeWidth={2.1} />}
            />
          </HStack>
        ) : a.status === "in_consultation" ? (
          <HStack gap={5} align="center">
            <Stethoscope size={14} color={palette.clinical[600]} strokeWidth={2.1} />
            <Text variant="label-sm" style={{ color: palette.clinical[700] }}>
              With the doctor
            </Text>
          </HStack>
        ) : null}
      </HStack>
    </Card>
  );
}

function CountTile({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <View style={styles.countTile}>
      <Text variant="metric-sm" tabular style={{ color: accent }}>
        {value}
      </Text>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  token: {
    width: 48,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  tokenIssued: {
    backgroundColor: palette.clinical[50],
    borderColor: palette.clinical[200],
  },
  tokenPending: {
    backgroundColor: palette.surface.tertiary,
    borderColor: palette.border.default,
  },
  countTile: {
    minWidth: 108,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.primary,
  },
});
