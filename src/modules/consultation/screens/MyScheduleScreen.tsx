import React, { useState } from "react";
import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  Stethoscope,
  Clock,
  TriangleAlert,
  ShieldAlert,
  FileWarning,
  CalendarDays,
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
  StatusChip,
  Banner,
  Skeleton,
  ErrorState,
  EmptyState,
  ChipsRow,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { formatWallTime, formatDuration, formatCalendarDate, todayCalendarDate } from "@shared/format";
import { useMySchedule } from "@modules/appointment/hooks/useAppointments";
import {
  useMyDrafts,
  useOpenConsultation,
} from "@modules/consultation/hooks/useConsultation";
import type { Appointment } from "@modules/appointment/types";
import type { PatientBanner } from "@modules/patient/types";

/**
 * AP-04: the doctor's own day.
 *
 * Scoped by their token server-side, not by a filter this screen chooses — a
 * doctor cannot see another doctor's list even by asking for it.
 */
export default function MyScheduleScreen() {
  const navigation = useNavigation<any>();
  const today = todayCalendarDate();

  const [filter, setFilter] = useState("waiting");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, error: loadError, refetch, isRefetching } = useMySchedule(today);
  const { data: drafts } = useMyDrafts();
  const openConsultation = useOpenConsultation();

  const all = data?.data ?? [];
  const counts = data?.meta?.counts;

  const visible = all.filter((a) => {
    if (filter === "waiting") return a.status === "arrived" || a.status === "in_consultation";
    if (filter === "expected") return a.status === "scheduled";
    if (filter === "done") return a.status === "completed";
    return true;
  });

  const see = async (a: Appointment) => {
    setError(null);
    const patient = a.patient as PatientBanner;
    try {
      const consultation = await openConsultation.mutateAsync({
        patientId: patient.id,
        appointmentId: a.id,
        type: "opd",
      });
      navigation.navigate("Consultation", {
        id: consultation.id,
        patientId: patient.id,
      });
    } catch (err) {
      setError(apiErrorMessage(err, "Could not open the consultation"));
    }
  };

  return (
    <Screen
      overline="Clinical"
      title="My schedule"
      subtitle={formatCalendarDate(today)}
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="my-schedule"
    >
      <VStack gap={14}>
        {error ? <Banner tone="danger" message={error} onDismiss={() => setError(null)} /> : null}

        {/*
          An unsigned note is a patient whose record does not yet say what
          happened to them. Nobody should go home with one open.
        */}
        {(drafts ?? []).length > 0 ? (
          <Card accentColor={palette.warning.text}>
            <SectionHeader
              title="Unfinished notes"
              subtitle="These consultations are not yet signed, so they are not in the record"
              right={<FileWarning size={16} color={palette.warning.text} strokeWidth={2.1} />}
            />
            <VStack gap={8}>
              {drafts!.map((d) => (
                <HStack key={d.id} gap={10} align="center" wrap>
                  <VStack gap={1} flex={1} style={{ minWidth: 160 }}>
                    <Text variant="label" tone="primary">
                      {d.patientName}
                    </Text>
                    <Text variant="caption" tone="tertiary" numberOfLines={1}>
                      {d.patientId} · {d.chiefComplaint || "nothing written yet"}
                    </Text>
                  </VStack>
                  <Button
                    label="Finish it"
                    variant="secondary"
                    size="sm"
                    fullWidth={false}
                    onPress={() => navigation.navigate("Consultation", { id: d.id })}
                  />
                </HStack>
              ))}
            </VStack>
          </Card>
        ) : null}

        {counts ? (
          <ChipsRow
            chips={[
              {
                key: "waiting",
                label: "Waiting for me",
                count: (counts.arrived ?? 0) + (counts.in_consultation ?? 0),
              },
              { key: "expected", label: "Later today", count: counts.scheduled },
              { key: "done", label: "Seen", count: counts.completed },
              { key: "all", label: "Everyone" },
            ]}
            active={filter}
            onChange={setFilter}
          />
        ) : null}

        {isError ? (
          <ErrorState error={loadError} title="Couldn't load your schedule" onRetry={refetch} />
        ) : isLoading ? (
          <VStack gap={8}>
            {[0, 1, 2].map((i) => (
              <Card key={i} compact>
                <Skeleton width="60%" height={16} />
              </Card>
            ))}
          </VStack>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={filter === "waiting" ? "Nobody is waiting for you" : "Nothing here"}
            message={
              filter === "waiting"
                ? "Patients appear here once reception marks them arrived."
                : undefined
            }
          />
        ) : (
          <VStack gap={8}>
            {visible.map((a) => (
              <ScheduleRow
                key={a.id}
                appointment={a}
                busy={openConsultation.isPending}
                onSee={() => see(a)}
                onOpenRecord={() => {
                  const p = a.patient as PatientBanner;
                  if (p?.id) navigation.navigate("MedicalRecord", { patientId: p.id });
                }}
              />
            ))}
          </VStack>
        )}
      </VStack>
    </Screen>
  );
}

function ScheduleRow({
  appointment: a,
  busy,
  onSee,
  onOpenRecord,
}: {
  appointment: Appointment;
  busy: boolean;
  onSee: () => void;
  onOpenRecord: () => void;
}) {
  const patient = a.patient as PatientBanner;
  const severe = (patient?.allergies ?? []).some(
    (x) => x.severity === "severe" || x.severity === "anaphylaxis",
  );
  const notRecorded = patient?.allergiesRecorded === false;
  const canSee = a.status === "arrived" || a.status === "in_consultation";

  return (
    <Card compact accentColor={severe ? signal.critical.color : undefined}>
      <HStack gap={12} align="center" wrap>
        <View style={[tokenBox, a.tokenNumber ? tokenIssued : tokenPending]}>
          <Text
            variant="metric-sm"
            tabular
            style={{ color: a.tokenNumber ? palette.clinical[700] : palette.text.disabled }}
          >
            {a.tokenNumber ?? "—"}
          </Text>
        </View>

        <VStack gap={3} flex={1} style={{ minWidth: 170 }}>
          <HStack gap={7} align="center" wrap>
            <Text variant="label-lg" tone="primary" numberOfLines={1}>
              {patient?.fullName ?? "—"}
            </Text>
            {/*
              The allergy marker rides with the name everywhere the name
              appears — including a list the doctor scans before opening
              anything.
            */}
            {severe ? (
              <TriangleAlert
                size={14}
                color={signal.critical.color}
                strokeWidth={2.4}
                accessibilityLabel="Severe allergy recorded"
              />
            ) : null}
            {notRecorded ? (
              <ShieldAlert
                size={13}
                color={palette.warning.text}
                strokeWidth={2.2}
                accessibilityLabel="Allergies not recorded"
              />
            ) : null}
          </HStack>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {patient?.patientId} · {patient?.age} · {patient?.gender}
            {a.reason ? ` · ${a.reason}` : ""}
          </Text>
        </VStack>

        <VStack gap={3} style={{ minWidth: 100 }}>
          <HStack gap={5} align="center">
            <Clock size={13} color={palette.text.tertiary} strokeWidth={2} />
            <Text variant="label-sm" tone="secondary" tabular>
              {formatWallTime(a.scheduledTime)}
            </Text>
          </HStack>
          {a.waitingMinutes !== null ? (
            <Text variant="caption" tone="tertiary">
              waiting {formatDuration(a.waitingMinutes)}
            </Text>
          ) : null}
        </VStack>

        <StatusChip status={a.status.replace("_", " ")} size="sm" />

        <HStack gap={6} wrap>
          <Button
            label="Record"
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={onOpenRecord}
          />
          {canSee ? (
            <Button
              label={a.status === "in_consultation" ? "Continue" : "See patient"}
              size="sm"
              fullWidth={false}
              disabled={busy}
              onPress={onSee}
              testID={`see-${a.appointmentNumber}`}
              icon={<Stethoscope size={14} color="#FFFFFF" strokeWidth={2.1} />}
            />
          ) : null}
        </HStack>
      </HStack>
    </Card>
  );
}

const tokenBox = {
  width: 46,
  height: 42,
  borderRadius: radius.md,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
} as const;

const tokenIssued = {
  backgroundColor: palette.clinical[50],
  borderColor: palette.clinical[200],
} as const;

const tokenPending = {
  backgroundColor: palette.surface.tertiary,
  borderColor: palette.border.default,
} as const;
