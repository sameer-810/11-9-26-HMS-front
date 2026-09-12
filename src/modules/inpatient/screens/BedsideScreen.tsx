import React, { useState } from "react";
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
} from "@shared/ui";
import { formatDateTime } from "@shared/format";
import { useBedside, useAddNursingNote, useTransfer } from "@modules/inpatient/hooks/useInpatient";
import { useSelectableBeds } from "@modules/inpatient/hooks/useBeds";
import { News2Score } from "@modules/inpatient/components/News2Score";
import { ObservationForm } from "@modules/inpatient/components/ObservationForm";
import { DrugRoundPanel } from "@modules/inpatient/components/DrugRoundPanel";
import { SbarPanel } from "@modules/inpatient/components/SbarPanel";
import type { PatientBanner } from "@modules/patient/types";
import type { Observation } from "@modules/inpatient/types";

/**
 * The bedside chart — IP-04.
 *
 * ---------------------------------------------------------------------------
 * Why this is tabbed rather than one long scroll
 * ---------------------------------------------------------------------------
 * It is read standing up, on a tablet, one-handed, with the other hand holding
 * something. The four things a nurse does at a bedside — look at the trend,
 * record observations, do the drug round, write a note — are separate tasks,
 * and stacking them into one scroll means the drug round is four swipes away
 * while a patient waits.
 *
 * What is NOT in a tab: the patient banner and the current score. Those stay
 * pinned above everything, because the identity of the patient in front of you
 * and how sick they are must never be something you scrolled past.
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
  const { data, isLoading, isError, error, refetch, isRefetching } = useBedside(admissionId);

  const admission = data?.admission;
  const patient = admission?.patient as PatientBanner | undefined;

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
    return (
      <Screen title="Bedside">
        <ErrorState error={error} onRetry={() => refetch()} />
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
        {/**
         * Pinned above the tabs. The current score and its escalation policy
         * are not a tab you can be on the wrong side of.
         */}
        <News2Score
          result={
            data?.observations.find((o) => o.news2.complete)?.news2 ?? null
          }
          size="lg"
          showResponse
        />

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
            useScale2={admission.news2Scale === 2}
            onRecorded={() => refetch()}
          />
        ) : null}

        {tab === "drugs" ? <DrugRoundPanel admissionId={admissionId} /> : null}

        {tab === "notes" ? (
          <VStack gap={16}>
            {canWriteNotes ? <NoteComposer admissionId={admissionId} /> : null}
            <NotesList notes={data?.notes ?? []} />
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
  return (
    <VStack gap={16}>
      <Card>
        <VStack gap={10}>
          <Text variant="h4">Observation trend</Text>
          {data.observations.length === 0 ? (
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
        {/* A dash, never a zero. A blank reading is not a measurement of nothing. */}
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
        {/**
         * Only free beds are selectable, and occupied ones are SHOWN as
         * disabled rather than hidden — a list with bed 12 quietly missing
         * makes the user hunt for something they can see on the ward.
         */}
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

function NoteComposer({ admissionId }: { admissionId: string }) {
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("general");
  const add = useAddNursingNote(admissionId);

  return (
    <Card>
      <VStack gap={12}>
        <Text variant="h4">Nursing note</Text>
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
            add.mutate({ note: note.trim(), category }, { onSuccess: () => setNote("") })
          }
          testID="note-submit"
        />
      </VStack>
    </Card>
  );
}

function NotesList({ notes }: { notes: { id: string; note: string; category: string; recordedAt: string; recordedBy: string; shift: string }[] }) {
  if (notes.length === 0) return null;
  return (
    <Card>
      <VStack gap={10}>
        <Text variant="overline" tone="secondary">
          Recent notes
        </Text>
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
