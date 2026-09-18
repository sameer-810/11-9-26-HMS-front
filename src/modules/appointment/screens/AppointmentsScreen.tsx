import React, { useState } from "react";
import { View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  CalendarPlus,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
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
  DataTable,
  type Column,
  ListRow,
  StatusChip,
  ChipsRow,
  Banner,
  Skeleton,
  ErrorState,
  ConfirmDialog,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import {
  todayCalendarDate,
  addCalendarDays,
  formatCalendarDate,
  formatWallTime,
} from "@shared/format";
import {
  useAppointments,
  useCancelAppointment,
} from "@modules/appointment/hooks/useAppointments";
import type { Appointment } from "@modules/appointment/types";
import type { PatientBanner } from "@modules/patient/types";

const STATUS_CHIPS = [
  { key: "", label: "All" },
  { key: "scheduled", label: "Scheduled" },
  { key: "arrived", label: "Arrived" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export default function AppointmentsScreen() {
  const navigation = useNavigation<any>();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.APPOINTMENTS_MANAGE);

  const route = useRoute<any>();
  // A booking or a move lands back here on its day. Synced during render, not in an effect.
  const routeDate = (route.params as { date?: string } | undefined)?.date;
  const [date, setDate] = useState(routeDate ?? todayCalendarDate());
  const [status, setStatus] = useState("");

  const [seenRouteDate, setSeenRouteDate] = useState(routeDate);
  if (routeDate !== seenRouteDate) {
    setSeenRouteDate(routeDate);
    if (routeDate) setDate(routeDate);
  }
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    data,
    isLoading,
    isError,
    error: loadError,
    refetch,
    isRefetching,
  } = useAppointments({
    date,
    ...(status ? { status } : {}),
    limit: 100,
  });

  const cancel = useCancelAppointment();
  const appointments = data?.data ?? [];

  const doCancel = async () => {
    if (!cancelTarget) return;
    setError(null);
    try {
      await cancel.mutateAsync({ id: cancelTarget.id });
    } catch (err) {
      setError(apiErrorMessage(err, "Could not cancel that appointment"));
    } finally {
      setCancelTarget(null);
    }
  };

  const columns: Column<Appointment>[] = [
    {
      key: "time",
      header: "Time",
      width: 100,
      sortable: true,
      sortValue: (a) => a.scheduledTime,
      render: (a) => (
        <Text variant="label" tone="primary" tabular>
          {formatWallTime(a.scheduledTime)}
        </Text>
      ),
    },
    {
      key: "patient",
      header: "Patient",
      flex: 2,
      render: (a) => {
        const p = a.patient as PatientBanner;
        return (
          <VStack gap={1}>
            <Text variant="label" tone="primary" numberOfLines={1}>
              {p?.fullName ?? "—"}
            </Text>
            <Text variant="caption" tone="tertiary" tabular numberOfLines={1}>
              {p?.patientId}
            </Text>
          </VStack>
        );
      },
    },
    {
      key: "doctor",
      header: "Doctor",
      flex: 1,
      render: (a) => (
        <Text variant="body-sm" tone="secondary" numberOfLines={1}>
          {(a.doctor as { fullName?: string })?.fullName ?? "—"}
        </Text>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      flex: 1,
      render: (a) => (
        <Text variant="body-sm" tone="tertiary" numberOfLines={1}>
          {a.reason || "—"}
        </Text>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 140,
      render: (a) => (
        <StatusChip status={a.status.replace("_", " ")} size="sm" />
      ),
    },
    {
      key: "actions",
      header: "",
      width: 180,
      align: "right",
      render: (a) =>
        canManage && ["scheduled", "arrived"].includes(a.status) ? (
          <HStack gap={6}>
            <Button
              label="Move"
              variant="secondary"
              size="xs"
              fullWidth={false}
              accessibilityHint="Choose another date or time"
              testID={`move-${a.appointmentNumber}`}
              onPress={() =>
                navigation.navigate("RescheduleAppointment", { id: a.id })
              }
            />
            <Button
              label="Cancel"
              variant="secondary"
              size="xs"
              fullWidth={false}
              testID={`cancel-${a.appointmentNumber}`}
              onPress={() => setCancelTarget(a)}
            />
          </HStack>
        ) : null,
    },
  ];

  return (
    <Screen
      overline="Front office"
      title="Appointments"
      subtitle={`${appointments.length} on ${formatCalendarDate(date)}`}
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="appointments-screen"
      right={
        canManage ? (
          <Button
            label="Book appointment"
            fullWidth={false}
            testID="book-cta"
            icon={<CalendarPlus size={16} color="#FFFFFF" strokeWidth={2.2} />}
            onPress={() => navigation.navigate("BookAppointment")}
          />
        ) : undefined
      }
    >
      <VStack gap={12}>
        {error ? (
          <Banner
            tone="danger"
            message={error}
            onDismiss={() => setError(null)}
          />
        ) : null}

        <HStack gap={10} align="center" wrap>
          <Button
            label="Previous"
            variant="secondary"
            size="sm"
            fullWidth={false}
            icon={
              <ChevronLeft
                size={15}
                color={palette.text.primary}
                strokeWidth={2.2}
              />
            }
            onPress={() => setDate((d) => addCalendarDays(d, -1))}
          />
          <View style={dateBox}>
            <HStack gap={8} align="center">
              <CalendarDays
                size={15}
                color={palette.clinical[600]}
                strokeWidth={2.1}
              />
              <Text variant="label" tone="primary" testID="appointments-date">
                {formatCalendarDate(date)}
              </Text>
            </HStack>
          </View>
          <Button
            label="Next"
            variant="secondary"
            size="sm"
            fullWidth={false}
            rightIcon={
              <ChevronRight
                size={15}
                color={palette.text.primary}
                strokeWidth={2.2}
              />
            }
            onPress={() => setDate((d) => addCalendarDays(d, 1))}
          />
          <Button
            label="Today"
            variant="ghost"
            size="sm"
            fullWidth={false}
            onPress={() => setDate(todayCalendarDate())}
          />
        </HStack>

        <ChipsRow chips={STATUS_CHIPS} active={status} onChange={setStatus} />

        {isError ? (
          <ErrorState
            error={loadError}
            title="Couldn't load appointments"
            onRetry={refetch}
          />
        ) : isLoading && appointments.length === 0 ? (
          <VStack gap={8}>
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} compact>
                <Skeleton width="65%" height={14} />
              </Card>
            ))}
          </VStack>
        ) : (
          <DataTable<Appointment>
            columns={columns}
            rows={appointments}
            keyExtractor={(a) => a.id}
            rowAccent={(a) =>
              (a.patient as PatientBanner)?.allergies?.some(
                (x) => x.severity === "severe" || x.severity === "anaphylaxis",
              )
                ? signal.critical.color
                : undefined
            }
            emptyIcon={CalendarDays}
            emptyTitle="Nothing booked for this day"
            emptyMessage={
              canManage ? "Book an appointment to fill the diary." : undefined
            }
            mobileCard={(a) => {
              const p = a.patient as PatientBanner;
              // The table's action column scrolls out of reach on a phone, so the card carries it.
              const actionable =
                canManage && ["scheduled", "arrived"].includes(a.status);
              return (
                <VStack gap={8}>
                  <ListRow
                    title={p?.fullName ?? "—"}
                    subtitle={`${formatWallTime(a.scheduledTime)} · ${(a.doctor as { fullName?: string })?.fullName ?? ""}`}
                    meta={p?.patientId}
                    right={
                      <StatusChip status={a.status.replace("_", " ")} size="sm" />
                    }
                  />
                  {actionable ? (
                    <HStack gap={6} justify="flex-end">
                      <Button
                        label="Move"
                        variant="secondary"
                        size="xs"
                        fullWidth={false}
                        accessibilityHint="Choose another date or time"
                        testID={`move-phone-${a.appointmentNumber}`}
                        onPress={() =>
                          navigation.navigate("RescheduleAppointment", {
                            id: a.id,
                          })
                        }
                      />
                      <Button
                        label="Cancel"
                        variant="secondary"
                        size="xs"
                        fullWidth={false}
                        testID={`cancel-phone-${a.appointmentNumber}`}
                        onPress={() => setCancelTarget(a)}
                      />
                    </HStack>
                  ) : null}
                </VStack>
              );
            }}
          />
        )}
      </VStack>

      <ConfirmDialog
        visible={Boolean(cancelTarget)}
        title="Cancel this appointment?"
        message={`${(cancelTarget?.patient as PatientBanner)?.fullName ?? "This patient"} at ${cancelTarget ? formatWallTime(cancelTarget.scheduledTime) : ""}. The slot is freed immediately and someone else can take it.`}
        confirmLabel="Cancel appointment"
        cancelLabel="Keep it"
        destructive
        loading={cancel.isPending}
        onConfirm={doCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </Screen>
  );
}

const dateBox = {
  paddingHorizontal: 14,
  paddingVertical: 7,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: palette.border.default,
  backgroundColor: palette.surface.secondary,
} as const;
