import React, { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { palette, signal } from "@shared/designSystem";
import { useAuthStore } from "@shared/store/useAuthStore";
import { PERMISSIONS } from "@shared/permissions";
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
  TextField,
  Select,
  Banner,
  EmptyState,
} from "@shared/ui";
import { formatDateTime } from "@shared/format";
import { useMyOps, type OutboxOp } from "@shared/offline/outbox";
import { useBedside, useAddNursingNote, useTransfer } from "@modules/inpatient/hooks/useInpatient";
import { useSelectableBeds } from "@modules/inpatient/hooks/useBeds";
import { News2Score } from "@modules/inpatient/components/News2Score";
import { ObservationForm } from "@modules/inpatient/components/ObservationForm";
import { DrugRoundPanel } from "@modules/inpatient/components/DrugRoundPanel";
import { SbarPanel } from "@modules/inpatient/components/SbarPanel";
import type { PatientBanner } from "@modules/patient/types";
import type { News2Result, Observation } from "@modules/inpatient/types";
import { calculateNews2, type News2Input } from "@shared/clinical/news2";
import { apiErrorCode, apiErrorDetails } from "@api/apiClient";
import { BreakGlassPrompt, EmergencyAccessBanner } from "@modules/consultation/components/BreakGlassPrompt";
import type { RecordAccess, RestrictedDetails } from "@modules/consultation/types";


/**
 * Bedside chart (IP-04): tabs for chart, observations, drug round and notes.
 * Patient banner and current score stay pinned above the tabs.
 */
type Tab = "chart" | "observations" | "drugs" | "notes";

const TABS: { key: Tab; label: string }[] = [
  { key: "chart", label: "Chart" },
  { key: "observations", label: "Record obs" },
  { key: "drugs", label: "Drug round" },
  { key: "notes", label: "Notes & handover" },
];

export default function BedsideScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const admissionId: string = route.params?.admissionId;

  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRecordVitals = hasPermission(PERMISSIONS.VITALS_RECORD);
  const canWriteNotes = hasPermission(PERMISSIONS.NURSING_NOTES_MANAGE);
  const canManageAdmission = hasPermission(PERMISSIONS.ADMISSION_MANAGE);

  const [tab, setTab] = useState<Tab>("chart");
  const { data, isLoading, isError, error, refetch, isRefetching, fetchStatus } = useBedside(admissionId);

  // Score the newest unsent local set, so the pinned score is never an older server one.
  const myOps = useMyOps();
  const news2Scale = data?.admission?.news2Scale;
  const pendingScore = useMemo(() => {
    const newest = [...myOps]
      .reverse()
      .find((o) => o.kind === "observation" && o.admissionId === admissionId && o.status === "pending");
    if (!newest) return null;
    const local = calculateNews2({ ...(newest.body as News2Input), useScale2: news2Scale === 2 });
    return { ...local, delta: null, significantRise: false } as News2Result;
  }, [myOps, admissionId, news2Scale]);

  const admission = data?.admission;
  const patient = admission?.patient as PatientBanner | undefined;
  const access = (data as { access?: RecordAccess } | undefined)?.access;

  // Offline with no mirrored copy: say so rather than show a spinner that never ends.
  if (!data && fetchStatus === "paused") {
    return (
      <Screen title="Bedside">
        <View testID="bedside-not-saved">
          <EmptyState
            title="Not saved on this device"
            message="This chart was not opened on this device while it was online, so there is no copy to show. It will load when the connection returns."
          />
        </View>
      </Screen>
    );
  }

  if (isLoading) {
    return (
      <Screen title="Bedside" scroll>
        <VStack gap={12}>
          <Skeleton height={90} />
          <Skeleton height={140} />
          <Skeleton height={200} />
        </VStack>
      </Screen>
    );
  }

  if (isError || !admission) {
    // Restricted record and not on the treating team: offer break-the-glass.
    const restricted =
      apiErrorCode(error) === "RECORD_RESTRICTED" ? apiErrorDetails<RestrictedDetails>(error) : undefined;
    return (
      <Screen title="Bedside">
        {restricted?.patientId ? (
          <BreakGlassPrompt patientId={restricted.patientId} details={restricted} />
        ) : (
          <ErrorState error={error} onRetry={() => refetch()} />
        )}
      </Screen>
    );
  }

  const visibleTabs = TABS.filter((t) => {
    if (t.key === "observations") return canRecordVitals;
    if (t.key === "drugs") return canRecordVitals || canWriteNotes;
    if (t.key === "notes") return canWriteNotes || canManageAdmission;
    return true;
  });

  return (
    <Screen
      title={patient?.fullName ?? admission.admissionNumber}
      subtitle={`${admission.ward?.name ?? ""}${admission.bed?.number ? ` · bed ${admission.bed.number}` : ""} · day ${admission.lengthOfStayDays ?? 1}`}
      patient={
        patient
          ? {
              id: patient.id,
              patientId: patient.patientId,
              fullName: patient.fullName,
              age: patient.age,
              gender: patient.gender,
              bloodGroup: patient.bloodGroup,
              allergies: patient.allergies,
              allergiesRecorded: patient.allergiesRecorded,
              status: patient.status,
              isMlc: patient.isMlc,
            }
          : undefined
      }
      scroll
      refreshing={isRefetching}
      onRefresh={() => refetch()}
      right={
        canManageAdmission ? (
          <HStack gap={8}>
            <Button
              label="Transfer"
              size="sm"
              variant="secondary"
              onPress={() => setTab("chart")}
              testID="open-transfer"
            />
            <Button
              label="Discharge"
              size="sm"
              onPress={() => navigation.navigate("Discharge", { admissionId })}
              testID="open-discharge"
            />
          </HStack>
        ) : null
      }
    >
      <VStack gap={16}>
        { /* Pinned above the tabs: access banner and current score. */ }
        {access?.viaBreakGlass && access.expiresAt ? (
          <EmergencyAccessBanner expiresAt={access.expiresAt} onExpired={() => refetch()} />
        ) : null}

        {pendingScore ? (
          <View testID="bedside-pending-score">
            <VStack gap={6}>
              <Banner
                tone="warning"
                title="The newest observations are on this device, not yet sent"
                message="This score is from the set charted here and worked out on this device. The escalation board has not seen it — act on it as you would on any score."
              />
              <News2Score result={pendingScore} size="lg" showResponse />
            </VStack>
          </View>
        ) : null}
        <VStack gap={4}>
          {pendingScore ? (
            <Text variant="caption" tone="tertiary">
              Last score filed on the server
            </Text>
          ) : null}
          <News2Score
            result={
              data?.observations.find((o) => o.news2.complete)?.news2 ?? null
            }
            size={pendingScore ? "md" : "lg"}
            showResponse={!pendingScore}
          />
        </VStack>

        <ChipsRow
          chips={visibleTabs.map((t) => ({ key: t.key, label: t.label }))}
          active={tab}
          onChange={(v) => setTab(v as Tab)}
        />

        {tab === "chart" ? (
          <ChartTab
            data={data!}
            admissionId={admissionId}
            canTransfer={canManageAdmission}
          />
        ) : null}

        {tab === "observations" && canRecordVitals ? (
          <ObservationForm
            admissionId={admissionId}
            patientName={patient?.fullName}
            useScale2={admission.news2Scale === 2}
            onRecorded={() => refetch()}
          />
        ) : null}

        {tab === "drugs" ? <DrugRoundPanel admissionId={admissionId} /> : null}

        {tab === "notes" ? (
          <VStack gap={16}>
            {canWriteNotes ? <NoteComposer admissionId={admissionId} patientName={patient?.fullName} /> : null}
            <NotesList notes={data?.notes ?? []} admissionId={admissionId} />
            <SbarPanel admissionId={admissionId} />
          </VStack>
        ) : null}
      </VStack>
    </Screen>
  );
}

function ChartTab({
  data,
  admissionId,
  canTransfer,
}: {
  data: NonNullable<ReturnType<typeof useBedside>["data"]>;
  admissionId: string;
  canTransfer: boolean;
}) {
  const myOps = useMyOps();
  const pending = useMemo(
    () => myOps.filter((o) => o.kind === "observation" && o.admissionId === admissionId),
    [myOps, admissionId],
  );

  return (
    <VStack gap={16}>
      <Card>
        <VStack gap={10}>
          <Text variant="h4">Observation trend</Text>
          { /* Offline sets first, styled so they are never mistaken for filed ones. */ }
          {pending.length > 0 ? (
            <VStack gap={8} testID="pending-observations">
              {pending
                .slice()
                .reverse()
                .map((op) => (
                  <PendingObservationRow key={op.id} op={op} />
                ))}
            </VStack>
          ) : null}
          {data.observations.length === 0 && pending.length === 0 ? (
            <Text variant="caption" tone="secondary">
              Nothing recorded yet.
            </Text>
          ) : (
            <VStack gap={8} testID="observation-trend">
              {data.observations.map((o) => (
                <ObservationRow key={o.id} observation={o} />
              ))}
            </VStack>
          )}
        </VStack>
      </Card>

      {canTransfer ? <TransferPanel admissionId={admissionId} /> : null}
    </VStack>
  );
}

function ObservationRow({ observation: o }: { observation: Observation }) {
  const v = o.vitals;
  const band = o.news2.band;
  const tone = band ? signal[band.tier] : null;

  return (
    <View
      style={[styles.obsRow, tone ? { borderLeftColor: tone.color } : null]}
      testID={`observation-${o.id}`}
    >
      <HStack gap={10} align="center" wrap>
        <VStack gap={2} style={{ minWidth: 120 }}>
          <Text variant="label-sm">{formatDateTime(o.recordedAt)}</Text>
          <Text variant="caption" tone="tertiary">
            {o.recordedBy}
          </Text>
          {o.syncedLateMinutes && o.syncedLateMinutes >= 5 ? (
            <Text variant="caption" tone="tertiary">
              charted offline · sent {o.syncedLateMinutes} min later
            </Text>
          ) : null}
        </VStack>

        <HStack gap={10} wrap style={{ flex: 1 }}>
          <Vital label="RR" value={v.respiratoryRate} />
          <Vital label="SpO₂" value={v.spo2} suffix="%" />
          <Vital label="O₂" value={v.onOxygen === null ? null : v.onOxygen ? "yes" : "air"} />
          <Vital label="BP" value={v.systolic ? `${v.systolic}/${v.diastolic ?? "—"}` : null} />
          <Vital label="HR" value={v.pulse} />
          <Vital label="Temp" value={v.temperatureC} suffix="°C" />
          <Vital label="ACVPU" value={v.consciousness || null} />
        </HStack>

        <VStack gap={2} align="flex-end" style={{ minWidth: 80 }}>
          {o.news2.complete ? (
            <Text variant="label" style={{ color: tone?.text }} tabular>
              NEWS {o.news2.total}
            </Text>
          ) : (
            <Text variant="caption" tone="tertiary">
              incomplete
            </Text>
          )}
          {o.escalation.required ? (
            <Text
              variant="caption"
              style={{ color: o.escalation.acknowledged ? signal.normal.text : signal.critical.text }}
            >
              {o.escalation.acknowledged ? "reviewed" : "escalated"}
            </Text>
          ) : null}
        </VStack>
      </HStack>
    </View>
  );
}

const VITAL_LABELS: [key: string, label: string, suffix?: string][] = [
  ["respiratoryRate", "RR"],
  ["spo2", "SpO₂", "%"],
  ["systolic", "BP"],
  ["pulse", "HR"],
  ["temperatureC", "Temp", "°C"],
  ["consciousness", "ACVPU"],
];

/** A set on this device, not yet on the server — shown as exactly that. */
function PendingObservationRow({ op }: { op: OutboxOp }) {
  const failed = op.status === "failed";
  return (
    <View
      style={[styles.obsRow, { borderLeftColor: failed ? signal.critical.color : palette.border.strong, borderStyle: "dashed" }]}
      testID={`pending-observation-${op.id}`}
    >
      <HStack gap={10} align="center" wrap>
        <VStack gap={2} style={{ minWidth: 120 }}>
          <Text variant="label-sm">{formatDateTime(op.takenAt)}</Text>
          <Text variant="caption" style={{ color: failed ? signal.critical.text : palette.warning.text }}>
            {failed ? "Not filed" : "Waiting to send"}
          </Text>
        </VStack>
        <HStack gap={10} wrap style={{ flex: 1 }}>
          {VITAL_LABELS.map(([key, label, suffix]) => {
            const value = op.body[key];
            return (
              <Vital
                key={key}
                label={label}
                value={typeof value === "number" || typeof value === "string" ? value : null}
                suffix={suffix}
              />
            );
          })}
        </HStack>
      </HStack>
      {failed && op.error ? (
        <Text variant="caption" style={{ color: signal.critical.text }}>
          {op.error}
        </Text>
      ) : null}
    </View>
  );
}

function Vital({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | string | null;
  suffix?: string;
}) {
  return (
    <VStack gap={0} style={styles.vital}>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
      <Text variant="label-sm" tabular>
        { /* A dash, never a zero, for a missing reading. */ }
        {value === null || value === undefined || value === "" ? "—" : `${value}${suffix ?? ""}`}
      </Text>
    </VStack>
  );
}

function TransferPanel({ admissionId }: { admissionId: string }) {
  const [open, setOpen] = useState(false);
  const [bedId, setBedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const beds = useSelectableBeds();
  const transfer = useTransfer(admissionId);

  if (!open) {
    return (
      <Button
        label="Move to another bed"
        variant="secondary"
        onPress={() => setOpen(true)}
        testID="transfer-open"
      />
    );
  }

  return (
    <Card testID="transfer-form">
      <VStack gap={12}>
        <Text variant="h4">Transfer</Text>
        { /* Occupied beds are shown disabled rather than hidden. */ }
        <Select
          label="New bed"
          value={bedId}
          options={beds.data ?? []}
          onChange={setBedId}
          placeholder="Choose a free bed"
        />
        <TextField
          label="Why is the patient moving?"
          value={reason}
          onChangeText={setReason}
          multiline
          testID="transfer-reason"
        />
        {transfer.isError ? <ErrorState error={transfer.error} /> : null}
        <HStack gap={8}>
          <Button
            label={transfer.isPending ? "Moving…" : "Transfer"}
            disabled={!bedId || reason.trim().length < 3 || transfer.isPending}
            onPress={() =>
              transfer.mutate(
                { bedId: bedId!, reason: reason.trim() },
                {
                  onSuccess: () => {
                    setOpen(false);
                    setReason("");
                    setBedId(null);
                  },
                },
              )
            }
            testID="transfer-submit"
          />
          <Button label="Cancel" variant="ghost" onPress={() => setOpen(false)} />
        </HStack>
      </VStack>
    </Card>
  );
}

function NoteComposer({ admissionId, patientName }: { admissionId: string; patientName?: string }) {
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("general");
  const [queued, setQueued] = useState(false);
  const add = useAddNursingNote(admissionId, patientName ? `Nursing note · ${patientName}` : "Nursing note");

  return (
    <Card>
      <VStack gap={12}>
        <Text variant="h4">Nursing note</Text>
        {queued ? (
          <View testID="note-queued">
            <Banner
              tone="warning"
              title="Saved on this device — not yet sent"
              message="The note will be filed automatically, at the time you wrote it, when the connection returns."
              onDismiss={() => setQueued(false)}
            />
          </View>
        ) : null}
        <Select
          label="Category"
          value={category}
          onChange={setCategory}
          options={[
            { value: "general", label: "General" },
            { value: "assessment", label: "Assessment" },
            { value: "intervention", label: "Intervention" },
            { value: "family", label: "Family communication" },
            { value: "incident", label: "Incident" },
          ]}
        />
        <TextField
          label="Note"
          hint="Notes are part of the clinical record and cannot be edited afterwards — a correction is a new note."
          value={note}
          onChangeText={setNote}
          multiline
          testID="note-text"
        />
        <Button
          label={add.isPending ? "Saving…" : "Add note"}
          disabled={note.trim().length < 3 || add.isPending}
          onPress={() =>
            add.mutate(
              { note: note.trim(), category },
              {
                onSuccess: (result) => {
                  setNote("");
                  setQueued(result.status === "queued");
                },
              },
            )
          }
          testID="note-submit"
        />
      </VStack>
    </Card>
  );
}

function NotesList({
  notes,
  admissionId,
}: {
  notes: { id: string; note: string; category: string; recordedAt: string; recordedBy: string; shift: string }[];
  admissionId: string;
}) {
  const myOps = useMyOps();
  const pending = useMemo(
    () => myOps.filter((o) => o.kind === "note" && o.admissionId === admissionId),
    [myOps, admissionId],
  );
  if (notes.length === 0 && pending.length === 0) return null;
  return (
    <Card>
      <VStack gap={10}>
        <Text variant="overline" tone="secondary">
          Recent notes
        </Text>
        {pending
          .slice()
          .reverse()
          .map((op) => (
            <View key={op.id} style={styles.note} testID={`pending-note-${op.id}`}>
              <VStack gap={3}>
                <HStack gap={8} align="center" wrap>
                  <Text variant="label-sm" style={{ color: op.status === "failed" ? signal.critical.text : palette.warning.text }}>
                    {op.status === "failed" ? "Not filed" : "Waiting to send"}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {formatDateTime(op.takenAt)}
                  </Text>
                </HStack>
                <Text variant="body-sm">{String(op.body.note ?? "")}</Text>
                {op.error ? (
                  <Text variant="caption" style={{ color: signal.critical.text }}>
                    {op.error}
                  </Text>
                ) : null}
              </VStack>
            </View>
          ))}
        {notes.map((n) => (
          <View key={n.id} style={styles.note}>
            <VStack gap={3}>
              <HStack gap={8} align="center" wrap>
                <Text variant="label-sm">{n.recordedBy}</Text>
                <Text variant="caption" tone="tertiary">
                  {formatDateTime(n.recordedAt)}
                  {n.shift ? ` · ${n.shift} shift` : ""} · {n.category}
                </Text>
              </HStack>
              <Text variant="body-sm">{n.note}</Text>
            </VStack>
          </View>
        ))}
      </VStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  obsRow: {
    borderLeftWidth: 3,
    borderLeftColor: palette.border.default,
    paddingLeft: 10,
    paddingVertical: 6,
  },
  vital: {
    minWidth: 56,
  },
  note: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: palette.border.subtle,
  },
});
