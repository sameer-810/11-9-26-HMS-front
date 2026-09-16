import React, { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  BedDouble,
  Activity,
  HeartPulse,
  TriangleAlert,
} from "lucide-react-native";

import { palette, radius, signal } from "@shared/designSystem";
import { useAuthStore } from "@shared/store/useAuthStore";
import { PERMISSIONS } from "@shared/permissions";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  Button,
  Banner,
  Skeleton,
  ErrorState,
  EmptyState,
  TextField,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { formatDateTime } from "@shared/format";
import {
  useAdmissions,
  useMyPatients,
  useEscalations,
  useAcknowledgeEscalation,
} from "@modules/inpatient/hooks/useInpatient";
import { News2Pill } from "@modules/inpatient/components/News2Score";
import { AdmissionRequests } from "@modules/inpatient/components/AdmissionRequests";
import type { AdmissionRow, EscalationRow } from "@modules/inpatient/types";
import type { PatientBanner } from "@modules/patient/types";

/**
 * Ward board (IP-02, IP-04, NU-01): ward, ICU or "my patients" mode, sickest first
 * (server sorts by NEWS2), with the escalation strip on top.
 */
export type BoardMode = "ward" | "icu" | "mine" | "doctor";

export default function WardBoardScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const userId = useAuthStore((s) => s.user?.id);

  const mode: BoardMode = route.params?.mode ?? "ward";

  const canAdmit = hasPermission(PERMISSIONS.ADMISSION_MANAGE);
  const canAcknowledge =
    hasPermission(PERMISSIONS.CONSULTATION_MANAGE) ||
    hasPermission(PERMISSIONS.PRESCRIPTION_CREATE) ||
    hasPermission(PERMISSIONS.ADMISSION_MANAGE);

  // Fire only this mode's query; the other endpoint may 403 for this role.
  const wardQuery = useAdmissions(
    mode === "icu"
      ? { status: "admitted", acuity: "critical" }
      : mode === "doctor"
        ? { status: "admitted", doctorId: userId, limit: 100 }
        : { status: "admitted", limit: 100 },
    mode !== "mine" && (mode !== "doctor" || Boolean(userId)),
  );
  const mineQuery = useMyPatients(mode === "mine");
  const query = mode === "mine" ? mineQuery : wardQuery;

  const escalations = useEscalations();
  const rows: AdmissionRow[] = query.data?.data ?? [];

  // A doctor's own list only raises their own patients.
  const escalationRows = useMemo(() => {
    const all = escalations.data ?? [];
    if (mode !== "doctor") return all;
    const mine = new Set((query.data?.data ?? []).map((r) => r.id));
    return all.filter((e) => e.admissionId && mine.has(e.admissionId));
  }, [escalations.data, query.data, mode]);

  const title =
    mode === "icu"
      ? "Intensive care"
      : mode === "mine" || mode === "doctor"
        ? "My patients"
        : "Admitted patients";

  return (
    <Screen
      title={title}
      testID={mode === "doctor" ? "doctor-my-patients" : undefined}
      subtitle={
        mode === "mine"
          ? "Allocated to you by name, and everyone on your wards"
          : mode === "doctor"
            ? "Admitted under your care, sickest first"
            : mode === "icu"
              ? "Every ICU and HDU bed, sickest first"
              : "Sickest first, not by bed number"
      }
      scroll
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
      right={
        canAdmit && mode !== "mine" ? (
          <Button
            label="Admit a patient"
            size="sm"
            onPress={() => navigation.navigate("AdmitPatient")}
            testID="admit-patient"
          />
        ) : null
      }
    >
      <VStack gap={16}>
        {/* NU-03: escalations always sit above everything. */}
        {escalationRows.length > 0 ? (
          <EscalationStrip
            rows={escalationRows}
            canAcknowledge={canAcknowledge}
            onOpen={(admissionId) =>
              navigation.navigate("Bedside", { admissionId })
            }
          />
        ) : null}

        {/* US-17: below the escalations — a deteriorating inpatient still comes first. */}
        {canAdmit && mode === "ward" ? (
          <AdmissionRequests
            onAdmit={(request) =>
              navigation.navigate("AdmitPatient", {
                patient: request.patient,
                consultationId: request.consultationId,
                reason: request.reason,
              })
            }
          />
        ) : null}

        {query.isLoading ? (
          <VStack gap={10}>
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </VStack>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={
              mode === "icu"
                ? Activity
                : mode === "mine" || mode === "doctor"
                  ? HeartPulse
                  : BedDouble
            }
            title={
              mode === "mine"
                ? "No patients allocated to you yet"
                : mode === "doctor"
                  ? "None of your patients are admitted"
                  : mode === "icu"
                    ? "No critical care patients"
                    : "Nobody is admitted"
            }
            message={
              mode === "mine"
                ? "The charge nurse allocates patients at the start of the shift."
                : mode === "doctor"
                  ? "Patients admitted under your name appear here, with their bed and latest early warning score. Today's outpatients are under My appointments."
                  : "Admitted patients appear here as soon as they are given a bed."
            }
          />
        ) : (
          <VStack gap={10} testID="ward-board">
            {rows.map((row) => (
              <AdmissionCard
                key={row.id}
                row={row}
                onPress={() =>
                  navigation.navigate("Bedside", { admissionId: row.id })
                }
              />
            ))}
          </VStack>
        )}
      </VStack>
    </Screen>
  );
}

function AdmissionCard({
  row,
  onPress,
}: {
  row: AdmissionRow;
  onPress: () => void;
}) {
  const patient = row.patient as PatientBanner;
  const named = Boolean(patient?.fullName);
  const tier = row.earlyWarning.tier;
  const accent =
    tier === "critical" || tier === "urgent" ? signal[tier].color : undefined;

  return (
    <Card
      onPress={onPress}
      accentColor={accent}
      testID={`admission-${row.admissionNumber}`}
      accessibilityLabel={`${named ? patient.fullName : "Patient"}, bed ${row.bed?.number ?? "unknown"}, ${row.earlyWarning.label}`}
    >
      <HStack gap={12} align="center" wrap>
        <VStack gap={2} style={styles.bedCell}>
          {/* One line: "ICU-01-1" broken at a hyphen reads as two beds. */}
          <Text variant="label" tabular numberOfLines={1}>
            {row.bed?.number ?? "—"}
          </Text>
          <Text variant="caption" tone="tertiary" numberOfLines={2}>
            {row.ward?.name ?? ""}
          </Text>
        </VStack>

        <VStack gap={3} style={{ flex: 1, minWidth: 180 }}>
          <HStack gap={8} align="center" wrap>
            <Text variant="label-lg">
              {named ? patient.fullName : row.admissionNumber}
            </Text>
            {named ? (
              <Text variant="caption" tone="secondary">
                {patient.age} · {patient.gender} · {patient.patientId}
              </Text>
            ) : null}
          </HStack>

          {/* Allergies shown here too: the drug round starts from this list. */}
          {named ? <AllergyLine patient={patient} /> : null}

          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {row.reason}
          </Text>
          <Text variant="caption" tone="tertiary">
            Day {row.lengthOfStayDays ?? 1} ·{" "}
            {row.doctor?.fullName ?? "no consultant"}
            {row.nurse ? ` · nurse ${row.nurse.fullName}` : ""}
          </Text>
        </VStack>

        <VStack gap={4} align="flex-end">
          <News2Pill summary={row.earlyWarning} />
          {row.earlyWarning.recordedAt ? (
            <Text variant="caption" tone="tertiary">
              {formatDateTime(row.earlyWarning.recordedAt)}
            </Text>
          ) : null}
          {row.news2Scale === 2 ? (
            <Text variant="caption" tone="tertiary">
              Scale 2
            </Text>
          ) : null}
        </VStack>
      </HStack>
    </Card>
  );
}

/** Tri-state like the patient banner: "not recorded" must never read as "no known allergies". */
function AllergyLine({ patient }: { patient: PatientBanner }) {
  if (!patient.allergiesRecorded) {
    return (
      <HStack gap={4} align="center">
        <TriangleAlert size={12} color={signal.caution.text} />
        <Text variant="caption" style={{ color: signal.caution.text }}>
          Allergies not recorded
        </Text>
      </HStack>
    );
  }
  if ((patient.allergies ?? []).length === 0) {
    return (
      <Text variant="caption" tone="tertiary">
        No known allergies
      </Text>
    );
  }
  return (
    <HStack gap={4} align="center">
      <TriangleAlert size={12} color={signal.critical.text} />
      <Text
        variant="caption"
        style={{ color: signal.critical.text }}
        numberOfLines={1}
      >
        Allergic to {patient.allergies.map((a) => a.substance).join(", ")}
      </Text>
    </HStack>
  );
}

function EscalationStrip({
  rows,
  canAcknowledge,
  onOpen,
}: {
  rows: EscalationRow[];
  canAcknowledge: boolean;
  onOpen: (admissionId: string) => void;
}) {
  const [acking, setAcking] = useState<EscalationRow | null>(null);
  const [note, setNote] = useState("");
  const acknowledge = useAcknowledgeEscalation();

  const worst = useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.news2.total ?? 0), 0),
    [rows],
  );

  return (
    <View style={styles.escalations} testID="escalation-strip">
      <VStack gap={10}>
        <HStack gap={8} align="center">
          <TriangleAlert size={18} color={signal.critical.text} />
          <Text variant="h4" style={{ color: signal.critical.text }}>
            {rows.length === 1
              ? "1 patient needs review"
              : `${rows.length} patients need review`}
          </Text>
          {worst > 0 ? (
            <Text variant="caption" style={{ color: signal.critical.text }}>
              highest NEWS {worst}
            </Text>
          ) : null}
        </HStack>

        {rows.map((row) => {
          const patient = row.patient as PatientBanner;
          return (
            <View
              key={row.id}
              style={styles.escalationRow}
              testID={`escalation-${row.id}`}
            >
              <VStack gap={6}>
                <HStack gap={8} align="center" wrap>
                  <Text variant="label">
                    {patient?.fullName ?? row.admissionNumber}
                  </Text>
                  <Text variant="caption" tone="secondary">
                    {row.ward}
                    {row.bed ? ` · bed ${row.bed}` : ""} · waiting{" "}
                    {row.waitingMinutes} min
                  </Text>
                </HStack>
                <Text variant="body-sm">{row.escalation.reason}</Text>
                <HStack gap={8} wrap>
                  <Button
                    label="Open chart"
                    size="sm"
                    variant="secondary"
                    onPress={() => onOpen(row.admissionId ?? "")}
                  />
                  {canAcknowledge ? (
                    <Button
                      label="I have reviewed this patient"
                      size="sm"
                      onPress={() => {
                        setAcking(row);
                        setNote("");
                      }}
                      testID={`acknowledge-${row.id}`}
                    />
                  ) : null}
                </HStack>

                {/* Acknowledging requires a short note, not a bare "reviewed". */}
                {acking?.id === row.id ? (
                  <VStack gap={8} testID="acknowledge-form">
                    <TextField
                      label="What did you find, and what are you doing about it?"
                      value={note}
                      onChangeText={setNote}
                      multiline
                      testID="acknowledge-note"
                    />
                    {acknowledge.isError ? (
                      <Banner
                        tone="danger"
                        message={apiErrorMessage(acknowledge.error)}
                      />
                    ) : null}
                    <HStack gap={8}>
                      <Button
                        label="Record review"
                        size="sm"
                        disabled={
                          note.trim().length < 5 || acknowledge.isPending
                        }
                        onPress={() =>
                          acknowledge.mutate(
                            { id: row.id, note: note.trim() },
                            { onSuccess: () => setAcking(null) },
                          )
                        }
                        testID="acknowledge-submit"
                      />
                      <Button
                        label="Cancel"
                        size="sm"
                        variant="ghost"
                        onPress={() => setAcking(null)}
                      />
                    </HStack>
                  </VStack>
                ) : null}
              </VStack>
            </View>
          );
        })}
      </VStack>
    </View>
  );
}

const styles = StyleSheet.create({
  escalations: {
    borderWidth: 1,
    borderColor: signal.critical.border,
    backgroundColor: signal.critical.bg,
    borderRadius: radius.md,
    padding: 12,
  },
  escalationRow: {
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.surface.raised,
    borderWidth: 1,
    borderColor: palette.border.subtle,
  },
  bedCell: {
    minWidth: 88,
    maxWidth: 140,
    flexShrink: 0,
  },
});
