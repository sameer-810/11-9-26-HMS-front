import React from "react";
import { View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { CircleCheck, CalendarPlus, ListOrdered } from "lucide-react-native";

import { palette, radius, signal } from "@shared/designSystem";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Button,
  Card,
  Skeleton,
  ErrorState,
} from "@shared/ui";
import { formatCalendarDate, formatWallTime } from "@shared/format";
import { useAppointment } from "@modules/appointment/hooks/useAppointments";
import type { PatientBanner } from "@modules/patient/types";
import { openScreen } from "@modules/patient/openScreen";

/** Booking confirmation for the desk to read back; the appointment number is shown largest. */
export default function AppointmentBookedScreen() {
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

  if (isLoading) {
    return (
      <Screen title="Appointment booked">
        <Card>
          <VStack gap={12}>
            <Skeleton width="50%" height={22} />
            <Skeleton width="70%" height={14} />
          </VStack>
        </Card>
      </Screen>
    );
  }

  if (isError || !appointment) {
    return (
      <Screen title="Appointment">
        <ErrorState
          error={error}
          title="Couldn't load this appointment"
          onRetry={refetch}
        />
      </Screen>
    );
  }

  const patient = appointment.patient as PatientBanner;
  const doctor = appointment.doctor as {
    fullName?: string;
    designation?: string;
  };

  return (
    <Screen
      overline="Front office"
      title="Appointment booked"
      testID="appointment-booked"
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
                  Booked
                </Text>
                <Text variant="body-sm" tone="tertiary">
                  Read this back to the patient.
                </Text>
              </VStack>
            </HStack>

            {/* The number the patient will quote on the phone. */}
            <View style={numberBox}>
              <Text variant="overline" tone="tertiary">
                Appointment number
              </Text>
              <Text
                variant="display"
                tone="primary"
                tabular
                testID="booked-number"
              >
                {appointment.appointmentNumber}
              </Text>
            </View>

            <VStack gap={0}>
              <Row
                label="Patient"
                value={`${patient?.fullName} · ${patient?.patientId}`}
              />
              <Row
                label="When"
                value={`${formatCalendarDate(appointment.scheduledDate)} at ${formatWallTime(appointment.scheduledTime)}`}
                testID="booked-when"
              />
              <Row
                label="Doctor"
                value={`${doctor?.fullName ?? ""}${doctor?.designation ? ` · ${doctor.designation}` : ""}`}
              />
              {appointment.department ? (
                <Row label="Department" value={appointment.department.name} />
              ) : null}
              {appointment.reason ? (
                <Row label="Reason" value={appointment.reason} />
              ) : null}
            </VStack>
          </VStack>
        </Card>

        <HStack gap={10} wrap>
          <Button
            label="Book another"
            variant="secondary"
            fullWidth={false}
            icon={
              <CalendarPlus
                size={16}
                color={palette.text.primary}
                strokeWidth={2.1}
              />
            }
            onPress={() => navigation.replace("BookAppointment")}
          />
          <Button
            label="Back to appointments"
            fullWidth={false}
            icon={<ListOrdered size={16} color="#FFFFFF" strokeWidth={2.1} />}
            testID="booked-back"
            // Booking also runs in the Patients stack, which has no appointments list.
            onPress={() =>
              openScreen(
                navigation,
                "Appointments",
                "AppointmentsList",
                { date: appointment.scheduledDate },
                { initial: true, pop: true },
              )
            }
          />
        </HStack>
      </VStack>
    </Screen>
  );
}

function Row({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}) {
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
      <Text variant="body" tone="primary" style={{ flex: 1 }} testID={testID}>
        {value}
      </Text>
    </HStack>
  );
}

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
} as const;
