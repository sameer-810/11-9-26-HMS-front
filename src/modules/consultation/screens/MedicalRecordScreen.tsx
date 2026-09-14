import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useRoute } from "@react-navigation/native";
import {
  FileText,
  Pill,
  CalendarDays,
  TriangleAlert,
  ShieldAlert,
  Lock,
  Eye,
} from "lucide-react-native";

import { palette, radius, signal } from "@shared/designSystem";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  SectionHeader,
  ChipsRow,
  Banner,
  Skeleton,
  ErrorState,
  EmptyState,
  StatusChip,
  SignalBadge,
} from "@shared/ui";
import { formatDateTime, formatCalendarDate, formatWallTime } from "@shared/format";
import { usePatientBanner } from "@modules/patient/hooks/usePatients";
import { useMedicalRecord } from "@modules/consultation/hooks/useConsultation";
import type { RecordScope, Consultation, Prescription, RestrictedDetails } from "@modules/consultation/types";
import { apiErrorCode, apiErrorDetails } from "@api/apiClient";
import { BreakGlassPrompt, EmergencyAccessBanner } from "@modules/consultation/components/BreakGlassPrompt";
import { useAuthStore } from "@shared/store/useAuthStore";
import { PERMISSIONS } from "@shared/permissions";
import { OrderTestsPanel } from "@modules/laboratory/components/OrderTestsPanel";
import { ResultTable } from "@modules/laboratory/components/ResultTable";
import {
  LAB_STAGE_LABELS,
  type RecordLabResult,
  type PendingLabOrder,
} from "@modules/laboratory/types";

/**
 * MR-01: one record, holding everything known about the patient.
 *
 * What arrives depends on the role. MR-02 to MR-04 give the nurse, the
 * laboratory and the pharmacist different parts of it, and the server assembles
 * a different record for each rather than sending everything and trusting the
 * UI to hide some of it.
 *
 * The scope is NAMED on screen. A clinician looking at a record with no
 * consultations in it needs to know whether that means the patient has never
 * been seen, or whether their role does not get to read them. Silence there is
 * how someone concludes a history is empty when it is merely withheld.
 */
const SCOPE_LABEL: Record<RecordScope, { label: string; note: string }> = {
  full: { label: "Full record", note: "" },
  nursing: {
    label: "Nursing view",
    note: "You see care-relevant content: allergies, medication and the doctor's instructions. Examination narratives and billing are not included.",
  },
  laboratory: {
    label: "Laboratory view",
    note: "You see patient identity, allergies and previous laboratory results. Diagnoses and treatment plans are not included; each request carries its own clinical indication.",
  },
  pharmacy: {
    label: "Pharmacy view",
    note: "You see allergies and prescriptions. Diagnosis detail is not included.",
  },
};

export default function MedicalRecordScreen() {
  const route = useRoute<any>();
  const { patientId } = (route.params ?? {}) as { patientId: string };

  const [tab, setTab] = useState("summary");
  const { data: banner } = usePatientBanner(patientId);
  const { data: record, isLoading, isError, error, refetch, isRefetching, fetchStatus } =
    useMedicalRecord(patientId);

  // Offline, and this record was never opened here while online. The mirror
  // holds what this user saw, not the whole hospital — and says so.
  if (!record && fetchStatus === "paused") {
    return (
      <Screen title="Medical record" patient={banner ?? undefined}>
        <View testID="record-not-saved">
          <EmptyState
            icon={FileText}
            title="Not saved on this device"
            message="This record was not opened on this device while it was online, so there is no copy to show offline. It will load when the connection returns."
          />
        </View>
      </Screen>
    );
  }

  if (isLoading) {
    return (
      <Screen title="Medical record" patient={banner ?? undefined}>
        <VStack gap={12}>
          <Skeleton width="35%" height={18} />
          <Card>
            <VStack gap={10}>
              <Skeleton width="85%" height={12} />
              <Skeleton width="60%" height={12} />
            </VStack>
          </Card>
        </VStack>
      </Screen>
    );
  }

  if (isError || !record) {
    const restricted =
      apiErrorCode(error) === "RECORD_RESTRICTED" ? apiErrorDetails<RestrictedDetails>(error) : undefined;
    return (
      <Screen title="Medical record" patient={banner ?? undefined}>
        {restricted ? (
          <BreakGlassPrompt patientId={patientId} details={restricted} />
        ) : (
          <ErrorState error={error} title="Couldn't open this record" onRetry={refetch} />
        )}
      </Screen>
    );
  }

  const scope = SCOPE_LABEL[record.scope];

  const chips = [
    { key: "summary", label: "Summary" },
    ...(record.consultations.length > 0 || record.scope === "full" || record.scope === "nursing"
      ? [{ key: "consultations", label: "Consultations", count: record.consultations.length }]
      : []),
    ...(record.prescriptions.length > 0 || record.scope === "pharmacy"
      ? [{ key: "medication", label: "Medication", count: record.prescriptions.length }]
      : []),
    // Shown to every scope that holds results, even when empty, so "no lab
    // results" is a stated fact rather than a missing tab.
    ...(record.scope !== "pharmacy"
      ? [{ key: "lab", label: "Lab results", count: record.labResults?.length ?? 0 }]
      : []),
    ...(record.visits.length > 0 ? [{ key: "visits", label: "Visits", count: record.visits.length }] : []),
  ];

  return (
    <Screen
      patient={banner ?? undefined}
      overline="Clinical"
      title="Medical record"
      subtitle={scope.label}
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="medical-record"
      right={
        <HStack gap={6} align="center">
          <Eye size={14} color={palette.text.tertiary} strokeWidth={2} />
          <Text variant="caption" tone="tertiary">
            This view is logged
          </Text>
        </HStack>
      }
    >
      <VStack gap={14}>
        {record.access?.viaBreakGlass && record.access.expiresAt ? (
          <EmergencyAccessBanner expiresAt={record.access.expiresAt} onExpired={refetch} />
        ) : record.access?.restricted ? (
          <Banner
            tone="warning"
            title="Restricted record"
            message="Open only to the patient's treating team. You have access as part of it; handle it accordingly."
          />
        ) : null}

        {/*
          Says plainly that this is a partial record, rather than letting a
          missing section read as an absent history.
        */}
        {scope.note ? <Banner tone="info" title={scope.label} message={scope.note} /> : null}

        <ChipsRow chips={chips} active={tab} onChange={setTab} />

        {tab === "summary" ? <SummaryTab record={record} /> : null}
        {tab === "consultations" ? <ConsultationsTab consultations={record.consultations} /> : null}
        {tab === "medication" ? <MedicationTab prescriptions={record.prescriptions} /> : null}
        {tab === "lab" ? (
          <LabResultsTab
            patientId={patientId}
            results={record.labResults ?? []}
            pending={record.pendingLabOrders ?? []}
          />
        ) : null}
        {tab === "visits" ? <VisitsTab visits={record.visits} /> : null}
      </VStack>
    </Screen>
  );
}

function SummaryTab({ record }: { record: NonNullable<ReturnType<typeof useMedicalRecord>["data"]> }) {
  const severe = record.allergies.filter(
    (a) => a.severity === "severe" || a.severity === "anaphylaxis",
  );

  return (
    <VStack gap={14}>
      <Card accentColor={severe.length ? signal.critical.color : undefined}>
        <SectionHeader title="Allergies" />
        {!record.allergiesRecorded ? (
          <VStack gap={6}>
            <HStack gap={8} align="center">
              <ShieldAlert size={16} color={palette.warning.text} strokeWidth={2.2} />
              <Text variant="label" weight="600" style={{ color: palette.warning.text }}>
                Not recorded
              </Text>
            </HStack>
            <Text variant="body-sm" tone="secondary">
              Nobody has asked. This is not the same as having none.
            </Text>
          </VStack>
        ) : record.allergies.length === 0 ? (
          <Text variant="label" weight="600" style={{ color: signal.normal.text }}>
            No known allergies — asked and recorded
          </Text>
        ) : (
          <VStack gap={8}>
            {record.allergies.map((a) => (
              <View key={a.substance}>
                <HStack gap={9} align="center" wrap>
                  <TriangleAlert size={15} color={signal.critical.color} strokeWidth={2.3} />
                  <Text variant="label-lg" tone="primary">
                    {a.substance}
                  </Text>
                  <SignalBadge
                    level={
                      a.severity === "anaphylaxis" || a.severity === "severe"
                        ? "critical"
                        : a.severity === "moderate"
                          ? "urgent"
                          : "caution"
                    }
                    label={a.severity}
                    size="sm"
                  />
                </HStack>
                {a.reaction ? (
                  <Text variant="body-sm" tone="secondary" style={{ marginLeft: 25 }}>
                    {a.reaction}
                  </Text>
                ) : null}
              </View>
            ))}
          </VStack>
        )}
      </Card>

      {record.chronicConditions.length > 0 ? (
        <Card>
          <SectionHeader title="Ongoing conditions" />
          <Text variant="body" tone="primary">
            {record.chronicConditions.join(" · ")}
          </Text>
        </Card>
      ) : null}

      {record.diagnosisHistory.length > 0 ? (
        <Card>
          <SectionHeader title="Diagnosis history" subtitle="Every diagnosis ever recorded" />
          <VStack gap={8}>
            {record.diagnosisHistory.map((d) => (
              <HStack key={d.description} gap={10} align="center">
                <View style={styles.dot} />
                <VStack gap={1} flex={1}>
                  <Text variant="body" tone="primary">
                    {d.description}
                    {d.code ? ` (${d.code})` : ""}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {d.occurrences > 1 ? `Recorded ${d.occurrences} times · ` : ""}
                    last {formatDateTime(d.lastRecorded)}
                  </Text>
                </VStack>
              </HStack>
            ))}
          </VStack>
        </Card>
      ) : null}
    </VStack>
  );
}

function ConsultationsTab({ consultations }: { consultations: Consultation[] }) {
  if (consultations.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No consultations on file"
        message="Nothing has been recorded for this patient yet, or your role does not include them."
      />
    );
  }

  return (
    <VStack gap={12}>
      {consultations.map((c) => (
        <Card key={c.id}>
          <VStack gap={10}>
            <HStack gap={10} align="center" wrap>
              <VStack gap={1} flex={1}>
                <Text variant="label-lg" tone="primary">
                  {c.chiefComplaint || "Consultation"}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {formatDateTime(c.createdAt)} ·{" "}
                  {(c.doctor as { name?: string })?.name ??
                    (c.doctor as { fullName?: string })?.fullName ??
                    ""}
                </Text>
              </VStack>
              {c.isSigned ? (
                <HStack gap={5} align="center">
                  <Lock size={12} color={palette.text.tertiary} strokeWidth={2} />
                  <Text variant="caption" tone="tertiary">
                    signed
                  </Text>
                </HStack>
              ) : null}
            </HStack>

            {c.diagnoses?.length ? (
              <VStack gap={3}>
                {c.diagnoses.map((d, i) => (
                  <Text key={`${d.description}-${i}`} variant="body-sm" tone="primary">
                    {d.description}
                    {d.code ? ` (${d.code})` : ""}
                  </Text>
                ))}
              </VStack>
            ) : null}

            {c.examination ? (
              <VStack gap={2}>
                <Text variant="label-sm" tone="tertiary">
                  Examination
                </Text>
                <Text variant="body-sm" tone="secondary">
                  {c.examination}
                </Text>
              </VStack>
            ) : null}

            {c.treatmentPlan ? (
              <VStack gap={2}>
                <Text variant="label-sm" tone="tertiary">
                  Plan
                </Text>
                <Text variant="body-sm" tone="secondary">
                  {c.treatmentPlan}
                </Text>
              </VStack>
            ) : null}

            {/* OP-06: corrections sit beside the original, never inside it. */}
            {c.addenda?.length ? (
              <VStack gap={6}>
                <Text variant="label-sm" tone="tertiary">
                  Added after signing
                </Text>
                {c.addenda.map((a) => (
                  <View key={a.id ?? a.createdAt} style={styles.addendum}>
                    <Text variant="body-sm" tone="primary">
                      {a.text}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      {a.authorName} · {formatDateTime(a.createdAt)}
                    </Text>
                  </View>
                ))}
              </VStack>
            ) : null}
          </VStack>
        </Card>
      ))}
    </VStack>
  );
}

function MedicationTab({ prescriptions }: { prescriptions: Prescription[] }) {
  if (prescriptions.length === 0) {
    return <EmptyState icon={Pill} title="Nothing prescribed" />;
  }

  return (
    <VStack gap={12}>
      {prescriptions.map((p) => (
        <Card key={p.id}>
          <VStack gap={10}>
            <HStack gap={10} align="center" wrap>
              <VStack gap={1} flex={1}>
                <Text variant="label-lg" tone="primary" tabular>
                  {p.prescriptionNumber}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {formatDateTime(p.createdAt)} · {p.doctor?.fullName ?? ""}
                </Text>
              </VStack>
              <StatusChip status={p.status.replace("_", " ")} size="sm" />
            </HStack>

            <VStack gap={8}>
              {p.lines.map((l) => (
                <View key={l.id} style={styles.medLine}>
                  <HStack gap={8} align="center" wrap>
                    <Text variant="label" tone="primary">
                      {l.medicineName}
                      {l.strength ? ` ${l.strength}` : ""}
                    </Text>
                    <Text variant="body-sm" tone="secondary" tabular>
                      {l.dose} · {l.frequency}
                      {l.durationDays ? ` · ${l.durationDays} days` : ""}
                    </Text>
                  </HStack>
                  {l.instructions ? (
                    <Text variant="caption" tone="tertiary">
                      {l.instructions}
                    </Text>
                  ) : null}

                  {/*
                    PH-03 asks for allergies at dispensing. This is stronger:
                    the pharmacist sees the exact alert the prescriber was shown
                    and the reason they gave. A reason without the alert beside
                    it is not reviewable.
                  */}
                  {l.overrideReason ? (
                    <View style={styles.override}>
                      <HStack gap={7} align="center">
                        <TriangleAlert size={13} color={signal.critical.color} strokeWidth={2.3} />
                        <Text variant="caption" weight="600" style={{ color: signal.critical.text }}>
                          {l.safetyAlerts[0]?.title ?? "Prescribed despite an alert"}
                        </Text>
                      </HStack>
                      <Text variant="caption" style={{ color: signal.critical.text }}>
                        {l.overrideReason} — {l.overriddenByName}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </VStack>
          </VStack>
        </Card>
      ))}
    </VStack>
  );
}

/**
 * LB-01 and LB-05 on the record.
 *
 * "Order a test straight from the patient's record" — so the order panel sits
 * here for anyone who may order, above the results it will eventually add to.
 * Reported results only; pending orders are listed separately so a doctor sees
 * a result is on its way before ordering the same test twice.
 */
function LabResultsTab({
  patientId,
  results,
  pending,
}: {
  patientId: string;
  results: RecordLabResult[];
  pending: PendingLabOrder[];
}) {
  const canOrder = useAuthStore((s) => s.hasPermission)(PERMISSIONS.LAB_REQUEST_CREATE);
  const [ordered, setOrdered] = useState<string | null>(null);

  return (
    <VStack gap={12} testID="record-lab-tab">
      {ordered ? (
        <Banner
          tone="success"
          title="Sent to the laboratory"
          message={ordered}
          onDismiss={() => setOrdered(null)}
        />
      ) : null}
      {canOrder ? <OrderTestsPanel patientId={patientId} onOrdered={setOrdered} /> : null}

      {pending.length > 0 ? (
        <Card testID="record-lab-pending">
          <SectionHeader title="Waiting for the laboratory" />
          <VStack gap={6}>
            {pending.map((o) => (
              <HStack key={o.id} gap={8} align="center" wrap>
                <Text variant="label">{o.testName}</Text>
                <Text variant="caption" tone="secondary">
                  {LAB_STAGE_LABELS[o.status]} · {o.urgency} · ordered {formatDateTime(o.requestedAt)} by {o.doctorName}
                </Text>
              </HStack>
            ))}
          </VStack>
        </Card>
      ) : null}

      {results.length === 0 ? (
        <EmptyState icon={FileText} title="No reported laboratory results" />
      ) : (
        results.map((r) => (
          <Card
            key={r.id}
            accentColor={r.hasCritical ? signal.critical.color : r.abnormalCount ? signal.urgent.color : undefined}
            testID={`record-lab-${r.orderNumber}`}
          >
            <VStack gap={8}>
              <SectionHeader
                title={r.testName}
                subtitle={`Reported ${formatDateTime(r.reportedAt)} · ordered by ${r.doctorName}`}
                right={
                  r.hasCritical ? (
                    <SignalBadge
                      level={r.criticalStatus === "acknowledged" ? "normal" : "critical"}
                      label={r.criticalStatus === "acknowledged" ? `Critical, acknowledged by ${r.acknowledgedByName}` : "Critical, not acknowledged"}
                      size="sm"
                    />
                  ) : null
                }
              />
              <Text variant="caption" tone="tertiary">
                Indication: {r.clinicalIndication}
              </Text>
              <ResultTable results={r.results} />
              {r.labComment ? (
                <Text variant="caption" tone="secondary">
                  Laboratory comment: {r.labComment}
                </Text>
              ) : null}
            </VStack>
          </Card>
        ))
      )}
    </VStack>
  );
}

function VisitsTab({
  visits,
}: {
  visits: NonNullable<ReturnType<typeof useMedicalRecord>["data"]>["visits"];
}) {
  if (visits.length === 0) return <EmptyState icon={CalendarDays} title="No visits recorded" />;

  return (
    <VStack gap={8}>
      {visits.map((v) => (
        <Card key={v.id} compact>
          <HStack gap={12} align="center" wrap>
            <VStack gap={1} flex={1}>
              <Text variant="label" tone="primary">
                {formatCalendarDate(v.date)} at {formatWallTime(v.time)}
              </Text>
              <Text variant="caption" tone="tertiary">
                {v.doctor}
                {v.department ? ` · ${v.department}` : ""}
                {v.reason ? ` · ${v.reason}` : ""}
              </Text>
            </VStack>
            <StatusChip status={v.status.replace("_", " ")} size="sm" />
          </HStack>
        </Card>
      ))}
    </VStack>
  );
}

const styles = StyleSheet.create({
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.clinical[600] },
  addendum: {
    padding: 9,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: palette.clinical[300],
    backgroundColor: palette.surface.secondary,
    gap: 3,
  },
  medLine: {
    padding: 9,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border.subtle,
    backgroundColor: palette.surface.secondary,
    gap: 4,
  },
  override: {
    marginTop: 4,
    padding: 7,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: signal.critical.border,
    backgroundColor: signal.critical.bg,
    gap: 2,
  },
});
