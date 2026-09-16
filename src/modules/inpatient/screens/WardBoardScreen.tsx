import React, { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { BedDouble, Activity, HeartPulse, TriangleAlert } from "lucide-react-native";

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
 * The ward board — IP-02, IP-04 and NU-01 in one screen.
 *
 * ---------------------------------------------------------------------------
 * Why the sickest patient is at the top
 * ---------------------------------------------------------------------------
 * A ward list ordered by admission date, or by bed number, buries the patient
 * who is deteriorating behind four who are comfortable. The server sorts by
 * NEWS2 descending, and the escalation strip sits above everything so a
 * deteriorating patient is the first thing on the screen rather than something
 * to be found by scrolling.
 *
 * The same screen serves three roles by changing one query:
 *   - the doctor's ward round (all admitted),
 *   - the intensivist's board (`acuity=critical`),
 *   - the nurse's own patients for the shift (`my-patients`).
 *
 * One screen rather than three, because they are the same information seen from
 * different chairs — and three copies is three places for a fix to be missed.
 */

export type BoardMode = "ward" | "icu" | "mine";

export default function WardBoardScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const mode: BoardMode = route.params?.mode ?? "ward";

  const canAdmit = hasPermission(PERMISSIONS.ADMISSION_MANAGE);
  const canAcknowledge =
    hasPermission(PERMISSIONS.CONSULTATION_MANAGE) ||
    hasPermission(PERMISSIONS.PRESCRIPTION_CREATE) ||
    hasPermission(PERMISSIONS.ADMISSION_MANAGE);

  // Only the query this mode actually needs is fired. See useInpatient.ts —
  // firing both sends a doctor at an endpoint nurses own and no one else does.
  const wardQuery = useAdmissions(
    mode === "icu"
      ? { status: "admitted", acuity: "critical" }
      : { status: "admitted", limit: 100 },
    mode !== "mine",
  );
  const mineQuery = useMyPatients(mode === "mine");
  const query = mode === "mine" ? mineQuery : wardQuery;

  const escalations = useEscalations();
  const rows: AdmissionRow[] = query.data?.data ?? [];

  const title =
    mode === "icu" ? "Intensive care" : mode === "mine" ? "My patients" : "Admitted patients";

  return (
    <Screen
      title={title}
      subtitle={
        mode === "mine"
          ? "Allocated to you by name, and everyone on your wards"
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
        {/**
         * NU-03. Above everything, always — the point of an early warning
         * system is that the warning is not something you have to go looking
         * for.
         */}
        {(escalations.data?.length ?? 0) > 0 ? (
          <EscalationStrip
            rows={escalations.data ?? []}
            canAcknowledge={canAcknowledge}
            onOpen={(admissionId) => navigation.navigate("Bedside", { admissionId })}
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
            icon={mode === "icu" ? Activity : mode === "mine" ? HeartPulse : BedDouble}
            title={
              mode === "mine"
                ? "No patients allocated to you yet"
                : mode === "icu"
                  ? "No critical care patients"
                  : "Nobody is admitted"
            }
            message={
              mode === "mine"
                ? "The charge nurse allocates patients at the start of the shift."
                : "Admitted patients appear here as soon as they are given a bed."
            }
          />
        ) : (
          <VStack gap={10} testID="ward-board">
            {rows.map((row) => (
              <AdmissionCard
                key={row.id}
                row={row}
                onPress={() => navigation.navigate("Bedside", { admissionId: row.id })}
              />
            ))}
          </VStack>
        )}
      </VStack>
    </Screen>
  );
}

function AdmissionCard({ row, onPress }: { row: AdmissionRow; onPress: () => void }) {
  const patient = row.patient as PatientBanner;
  const named = Boolean(patient?.fullName);
  const tier = row.earlyWarning.tier;
  const accent = tier === "critical" || tier === "urgent" ? signal[tier].color : undefined;

  return (
    <Card
      onPress={onPress}
      accentColor={accent}
      testID={`admission-${row.admissionNumber}`}
      accessibilityLabel={`${named ? patient.fullName : "Patient"}, bed ${row.bed?.number ?? "unknown"}, ${row.earlyWarning.label}`}
    >
      <HStack gap={12} align="center" wrap>
        <VStack gap={2} style={styles.bedCell}>
          <Text variant="label" tabular>
            {row.bed?.number ?? "—"}
          </Text>
          <Text variant="caption" tone="tertiary">
            {row.ward?.name ?? ""}
          </Text>
        </VStack>

        <VStack gap={3} style={{ flex: 1, minWidth: 180 }}>
          <HStack gap={8} align="center" wrap>
            <Text variant="label-lg">{named ? patient.fullName : row.admissionNumber}</Text>
            {named ? (
              <Text variant="caption" tone="secondary">
                {patient.age} · {patient.gender} · {patient.patientId}
              </Text>
            ) : null}
          </HStack>

          {/**
           * Allergies on the ward board, not only on the chart. The drug round
           * starts from this list, and a nurse should not have to open a record
           * to find out that the patient they are about to give amoxicillin to
           * has an anaphylaxis history.
           */}
          {named ? <AllergyLine patient={patient} /> : null}

          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {row.reason}
          </Text>
          <Text variant="caption" tone="tertiary">
            Day {row.lengthOfStayDays ?? 1} · {row.doctor?.fullName ?? "no consultant"}
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

/**
 * Tri-state, exactly as the patient banner does it.
 *
 * "No allergies recorded" and "no known allergies" are different facts, and
 * collapsing them is how a patient with an unasked-about allergy is treated as
 * though they were asked.
 */
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
      <Text variant="caption" style={{ color: signal.critical.text }} numberOfLines={1}>
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
            {rows.length} patient{rows.length === 1 ? "" : "s"} need review
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
            <View key={row.id} style={styles.escalationRow} testID={`escalation-${row.id}`}>
              <VStack gap={6}>
                <HStack gap={8} align="center" wrap>
                  <Text variant="label">{patient?.fullName ?? row.admissionNumber}</Text>
                  <Text variant="caption" tone="secondary">
                    {row.ward}
                    {row.bed ? ` · bed ${row.bed}` : ""} · waiting {row.waitingMinutes} min
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

                {/**
                 * Acknowledging requires a sentence. "Reviewed" with nothing
                 * after it is the entry that turns up in every serious incident
                 * report — asking for one line is the smallest possible version
                 * of making someone actually look.
                 */}
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
                      <Banner tone="danger" message={apiErrorMessage(acknowledge.error)} />
                    ) : null}
                    <HStack gap={8}>
                      <Button
                        label="Record review"
                        size="sm"
                        disabled={note.trim().length < 5 || acknowledge.isPending}
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
    minWidth: 56,
  },
});
