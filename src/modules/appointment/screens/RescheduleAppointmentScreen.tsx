import React, { useState } from "react";
import { View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  ArrowRight,
  CalendarDays,
  CalendarSync,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ListOrdered,
} from "lucide-react-native";

import { palette, radius, signal } from "@shared/designSystem";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Button,
  Card,
  SectionHeader,
  TextField,
  Banner,
  Skeleton,
  SlotGrid,
  ErrorState,
  StatusChip,
} from "@shared/ui";
import { apiErrorCode, apiErrorMessage } from "@api/apiClient";
import {
  useAppointment,
  useAvailability,
  useReschedule,
} from "@modules/appointment/hooks/useAppointments";
import {
  todayCalendarDate,
  addCalendarDays,
  formatCalendarDate,
  formatWallTime,
} from "@shared/format";
import type { Appointment } from "@modules/appointment/types";
import type { PatientBanner } from "@modules/patient/types";
import { openScreen } from "@modules/patient/openScreen";

/**
 * Move an appointment (AP-02) to another free slot with the same doctor. The server cancels
 * the original and books a linked replacement, so the history shows both.
 */
export default function RescheduleAppointmentScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { id } = (route.params ?? {}) as { id: string };

  const {
    data: appointment,
    isLoading,
    isError,
    error,
    refetch,
  } = useAppointment(id);

  // null until the desk moves off the appointment's own day.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [moved, setMoved] = useState<Appointment | null>(null);

  const doctor = appointment?.doctor as
    { id: string; fullName?: string; designation?: string } | undefined;
  const today = todayCalendarDate();
  // A past appointment is moved forward, never onto a day already gone.
  const startDate = appointment
    ? appointment.scheduledDate < today
      ? today
      : appointment.scheduledDate
    : today;
  const date = pickedDate ?? startDate;

  const { data: availability, isLoading: loadingSlots } = useAvailability(
    moved ? undefined : doctor?.id,
    date,
  );
  const reschedule = useReschedule();

  const shiftDate = (days: number) => {
    const next = addCalendarDays(date, days);
    if (next < today) return;
    setPickedDate(next);
    setTime(null);
  };

  const backToList = (onDate?: string) =>
    openScreen(
      navigation,
      "Appointments",
      "AppointmentsList",
      onDate ? { date: onDate } : undefined,
      { initial: true, pop: true },
    );

  const submit = async () => {
    if (!appointment || !time) return;
    setSaveError(null);
    try {
      setMoved(
        await reschedule.mutateAsync({
          id: appointment.id,
          date,
          time,
          reason: reason.trim() || undefined,
        }),
      );
    } catch (err) {
      const code = apiErrorCode(err);
      // Taken or off the roster since the grid loaded: clear it so another can be picked.
      if (
        code === "SLOT_UNAVAILABLE" ||
        code === "SLOT_NOT_ON_ROSTER" ||
        code === "NO_CLINIC"
      ) {
        setTime(null);
      }
      setSaveError(apiErrorMessage(err, "Could not move this appointment"));
    }
  };

  if (isLoading) {
    return (
      <Screen title="Move appointment">
        <Card>
          <VStack gap={12}>
            <Skeleton width="50%" height={20} />
            <Skeleton width="70%" height={14} />
          </VStack>
        </Card>
      </Screen>
    );
  }

  if (isError || !appointment) {
    return (
      <Screen title="Move appointment">
        <ErrorState
          error={error}
          title="Couldn't load this appointment"
          onRetry={refetch}
        />
      </Screen>
    );
  }

  const patient = appointment.patient as PatientBanner;
  const movable = ["scheduled", "arrived"].includes(appointment.status);

  if (moved) {
    return (
      <Screen
        patient={patient?.fullName ? patient : undefined}
        overline="Front office"
        title="Appointment moved"
        testID="reschedule-done"
      >
        <VStack gap={16} style={{ maxWidth: 620 }}>
          <Card>
            <VStack gap={16}>
              <HStack gap={12} align="center">
                <View style={confirmMark}>
                  <CircleCheck
                    size={22}
                    color={signal.normal.color}
                    strokeWidth={2.2}
                  />
                </View>
                <VStack gap={2} flex={1}>
                  <Text variant="h2" tone="primary">
                    Moved
                  </Text>
                  <Text variant="body-sm" tone="tertiary">
                    Tell the patient the new time. The old slot is free again.
                  </Text>
                </VStack>
              </HStack>

              <View style={numberBox}>
                <Text variant="overline" tone="tertiary">
                  New time
                </Text>
                <Text
                  variant="h1"
                  tone="primary"
                  tabular
                  testID="reschedule-new-when"
                >
                  {formatCalendarDate(moved.scheduledDate)} at{" "}
                  {formatWallTime(moved.scheduledTime)}
                </Text>
                <Text variant="caption" tone="tertiary" tabular>
                  Appointment number {moved.appointmentNumber} · was{" "}
                  {appointment.appointmentNumber}
                </Text>
              </View>

              <VStack gap={0}>
                <Row
                  label="Patient"
                  value={`${patient?.fullName ?? ""} · ${patient?.patientId ?? ""}`}
                />
                <Row
                  label="Was"
                  value={`${formatCalendarDate(appointment.scheduledDate)} at ${formatWallTime(appointment.scheduledTime)}`}
                />
                <Row
                  label="Doctor"
                  value={`${doctor?.fullName ?? ""}${doctor?.designation ? ` · ${doctor.designation}` : ""}`}
                />
              </VStack>
            </VStack>
          </Card>

          <HStack gap={10} wrap>
            <Button
              label="Back to appointments"
              fullWidth={false}
              icon={<ListOrdered size={16} color="#FFFFFF" strokeWidth={2.1} />}
              onPress={() => backToList(moved.scheduledDate)}
              testID="reschedule-back"
            />
          </HStack>
        </VStack>
      </Screen>
    );
  }

  return (
    <Screen
      patient={patient?.fullName ? patient : undefined}
      overline="Front office"
      title="Move appointment"
      subtitle={`${appointment.appointmentNumber} · ${doctor?.fullName ?? ""}`}
      testID="reschedule-screen"
    >
      <VStack gap={16} style={{ maxWidth: 860 }}>
        {saveError ? (
          <Banner
            tone="danger"
            message={saveError}
            onDismiss={() => setSaveError(null)}
          />
        ) : null}

        <Card testID="reschedule-current">
          <SectionHeader title="Booked now" />
          <HStack gap={12} align="center" wrap>
            <VStack gap={2} flex={1} style={{ minWidth: 200 }}>
              <Text variant="label-lg" tone="primary">
                {formatCalendarDate(appointment.scheduledDate)} at{" "}
                {formatWallTime(appointment.scheduledTime)}
              </Text>
              <Text variant="body-sm" tone="tertiary">
                {patient?.fullName} · {doctor?.fullName}
                {appointment.reason ? ` · ${appointment.reason}` : ""}
              </Text>
            </VStack>
            <StatusChip status={appointment.status.replace("_", " ")} />
          </HStack>
        </Card>

        {!movable ? (
          <Banner
            tone="warning"
            message={`This appointment is ${appointment.status.replace("_", " ")} and cannot be moved. Book a new one instead.`}
          />
        ) : (
          <>
            <Card>
              <SectionHeader
                title="New date and time"
                subtitle={`Free slots on ${doctor?.fullName ?? "the doctor"}'s roster`}
              />

              <HStack gap={10} align="center" style={{ marginBottom: 14 }} wrap>
                <Button
                  label="Previous"
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  disabled={date <= today}
                  icon={
                    <ChevronLeft
                      size={15}
                      color={palette.text.primary}
                      strokeWidth={2.2}
                    />
                  }
                  onPress={() => shiftDate(-1)}
                />
                <View style={dateBox}>
                  <HStack gap={8} align="center">
                    <CalendarDays
                      size={16}
                      color={palette.clinical[600]}
                      strokeWidth={2.1}
                    />
                    <Text
                      variant="label-lg"
                      tone="primary"
                      testID="reschedule-date"
                    >
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
                  onPress={() => shiftDate(1)}
                />
              </HStack>

              {loadingSlots ? (
                <HStack gap={8} wrap>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <Skeleton key={i} width={92} height={44} />
                  ))}
                </HStack>
              ) : (
                <SlotGrid
                  slots={availability?.slots ?? []}
                  value={time}
                  onChange={setTime}
                  unavailableReason={availability?.reason}
                  testID="reschedule-slot-grid"
                />
              )}
              {date === appointment.scheduledDate ? (
                <Text
                  variant="caption"
                  tone="tertiary"
                  style={{ marginTop: 10 }}
                >
                  {`Their current slot, ${formatWallTime(appointment.scheduledTime)}, shows as booked until the move is saved.`}
                </Text>
              ) : null}
            </Card>

            <Card>
              <SectionHeader title="Why it is moving" subtitle="Optional" />
              <TextField
                label="Reason"
                value={reason}
                onChangeText={setReason}
                placeholder="Patient asked for a later time"
                maxLength={300}
                hint="Kept with the cancelled original, for the history."
                testID="reschedule-reason"
              />
            </Card>

            <HStack gap={10} justify="flex-end" wrap>
              <Button
                label="Cancel"
                variant="secondary"
                fullWidth={false}
                onPress={() =>
                  navigation.canGoBack() ? navigation.goBack() : backToList()
                }
              />
              <Button
                label={
                  time ? `Move to ${formatWallTime(time)}` : "Choose a slot"
                }
                fullWidth={false}
                disabled={!time}
                loading={reschedule.isPending}
                onPress={submit}
                testID="reschedule-submit"
                icon={
                  time ? (
                    <ArrowRight size={16} color="#FFFFFF" strokeWidth={2.1} />
                  ) : (
                    <CalendarSync size={16} color="#FFFFFF" strokeWidth={2.1} />
                  )
                }
              />
            </HStack>
          </>
        )}
      </VStack>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <HStack
      gap={12}
      align="center"
      style={{
        paddingVertical: 9,
        borderBottomWidth: 1,
        borderBottomColor: palette.border.subtle,
      }}
    >
      <View style={{ width: 110 }}>
        <Text variant="label-sm" tone="tertiary">
          {label}
        </Text>
      </View>
      <Text variant="body" tone="primary" style={{ flex: 1 }}>
        {value}
      </Text>
    </HStack>
  );
}

const dateBox = {
  paddingHorizontal: 14,
  paddingVertical: 8,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: palette.border.default,
  backgroundColor: palette.surface.secondary,
} as const;

const confirmMark = {
  width: 44,
  height: 44,
  borderRadius: radius.full,
  backgroundColor: signal.normal.bg,
  alignItems: "center",
  justifyContent: "center",
} as const;

const numberBox = {
  paddingHorizontal: 16,
  paddingVertical: 12,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: palette.border.default,
  backgroundColor: palette.surface.secondary,
  alignItems: "center",
  gap: 2,
} as const;
