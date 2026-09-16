import React, { useState } from "react";
import { View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ambulance, FileText, Stethoscope, UserCheck, DoorOpen, BedDouble, ClipboardList } from "lucide-react-native";

import { palette } from "@shared/designSystem";
import { useAuthStore } from "@shared/store/useAuthStore";
import { PERMISSIONS } from "@shared/permissions";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  SectionHeader,
  Button,
  Banner,
  Skeleton,
  ErrorState,
  StatusChip,
  Select,
  TextField,
  ConfirmDialog,
} from "@shared/ui";
import { apiErrorCode, apiErrorMessage } from "@api/apiClient";
import { formatDateTime, formatDuration } from "@shared/format";
import { useDoctors } from "@modules/appointment/hooks/useDirectory";
import {
  useAssignEdDoctor,
  useDispose,
  useEmergencyMeta,
  useEmergencyVisit,
  useLeftWithoutBeingSeen,
  useMarkEdArrived,
  useStartTreatment,
} from "@modules/emergency/hooks/useEmergency";
import { EsiBadge } from "@modules/emergency/components/EsiBadge";
import { TriageForm } from "@modules/emergency/components/TriageForm";
import { ChoiceChips } from "@modules/emergency/components/Choices";
import {
  ACTIVE_STATUSES,
  ARRIVAL_MODE_LABELS,
  DISPOSITION_LABELS,
  ED_STATUS_LABELS,
  hasBanner,
  type DispositionType,
  type EdVisit,
} from "@modules/emergency/types";

const DISPOSITIONS = Object.keys(DISPOSITION_LABELS) as DispositionType[];

/**
 * One emergency attendance, door to disposition. Cards follow the server's roles: reception handles
 * arrival and leaving, nurses and doctors triage, only doctors treat and dispose.
 */
export default function EmergencyVisitScreen() {
  const route = useRoute<any>();
  const { visitId } = (route.params ?? {}) as { visitId: string };

  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRunDepartment = hasPermission(PERMISSIONS.TRIAGE_MANAGE);
  const canTriage = hasPermission(PERMISSIONS.VITALS_RECORD) || hasPermission(PERMISSIONS.CONSULTATION_MANAGE);
  const canTreat = hasPermission(PERMISSIONS.CONSULTATION_MANAGE);

  const { data: visit, isLoading, isError, error, refetch, isRefetching } = useEmergencyVisit(visitId);
  const { data: meta } = useEmergencyMeta();

  const [notice, setNotice] = useState<string | null>(null);

  if (isError) {
    return (
      <Screen overline="Emergency" title="Attendance" testID="ed-visit">
        <ErrorState error={error} title="Couldn't load this attendance" onRetry={refetch} />
      </Screen>
    );
  }
  if (isLoading || !visit) {
    return (
      <Screen overline="Emergency" title="Attendance" testID="ed-visit">
        <VStack gap={10}>
          <Skeleton height={64} />
          <Skeleton height={200} />
        </VStack>
      </Screen>
    );
  }

  const active = ACTIVE_STATUSES.includes(visit.status);
  const arrived = visit.status !== "expected";
  const banner = hasBanner(visit.patient) ? visit.patient : undefined;

  return (
    <Screen
      overline={`Emergency · ${visit.visitNumber}`}
      title={visit.chiefComplaint}
      subtitle={`${ARRIVAL_MODE_LABELS[visit.arrivalMode]}${visit.arrivedAt ? ` · arrived ${formatDateTime(visit.arrivedAt)}` : ""}`}
      patient={banner}
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="ed-visit"
    >
      <VStack gap={14}>
        {notice ? (
          <View testID="ed-visit-notice">
            <Banner tone="success" message={notice} onDismiss={() => setNotice(null)} />
          </View>
        ) : null}

        {banner?.accessRestricted ? (
          <Banner tone="warning" message="This patient's record is access-restricted. Opening the medical record is logged." />
        ) : null}

        <FactsCard visit={visit} />

        {visit.status === "expected" && canRunDepartment ? (
          <ArriveCard visit={visit} />
        ) : null}

        {visit.esiLevel || !canTriage ? <TriageSummary visit={visit} clinical={canTriage} /> : null}

        {canTriage && active && arrived ? (
          meta ? (
            <TriageForm
              // Re-mounted after each save, so a re-triage starts from the answers just recorded.
              key={`${visit.id}-${visit.triageCount ?? 0}`}
              visit={visit}
              meta={meta}
              onSaved={setNotice}
            />
          ) : (
            <Skeleton height={240} />
          )
        ) : canTriage && visit.status === "expected" ? (
          <Text variant="caption" tone="tertiary">
            Triage opens once the ambulance is marked arrived.
          </Text>
        ) : null}

        {canTriage && active && arrived && !canTreat ? <AssignCard visit={visit} /> : null}

        {canTreat && active && arrived ? <DoctorCard visit={visit} /> : null}

        {canTreat && active && arrived ? <DispositionCard visit={visit} onDone={setNotice} /> : null}

        {canRunDepartment && active && !visit.seenByDoctorAt ? <LeftCard visit={visit} onDone={setNotice} /> : null}

        {!active ? <OutcomeCard visit={visit} /> : null}
      </VStack>
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <VStack gap={1} style={{ minWidth: 160, flexGrow: 1, flexBasis: 160 }}>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
      <Text variant="body-sm" tone="primary">
        {value}
      </Text>
    </VStack>
  );
}

function FactsCard({ visit: v }: { visit: EdVisit }) {
  const a = v.ambulance;
  return (
    <Card testID="ed-visit-facts">
      <VStack gap={12}>
        <HStack gap={10} align="center" wrap>
          <EsiBadge level={v.esiLevel} label={v.esiLabel} testID="ed-visit-esi" />
          <StatusChip status={ED_STATUS_LABELS[v.status]} />
          {v.arrivalMode === "ambulance" ? <Ambulance size={16} color={palette.clinical[700]} strokeWidth={2} /> : null}
          {v.isMlc ? <StatusChip status="Medico-legal case" /> : null}
          {v.unidentified ? <StatusChip status="Unidentified patient" /> : null}
        </HStack>
        <HStack gap={14} wrap>
          <Fact label="Visit" value={v.visitNumber} />
          <Fact label="Arrival" value={ARRIVAL_MODE_LABELS[v.arrivalMode]} />
          <Fact label="Arrived" value={v.arrivedAt ? formatDateTime(v.arrivedAt) : "Not yet"} />
          <Fact label="Expected" value={v.status === "expected" && v.expectedAt ? formatDateTime(v.expectedAt) : null} />
          <Fact label="Target to be seen" value={v.targetMinutes === null ? null : v.targetMinutes === 0 ? "Immediately" : formatDuration(v.targetMinutes)} />
          <Fact label="Brought by" value={v.broughtBy} />
          <Fact label="Referred from" value={v.referredFrom} />
          <Fact label="Ambulance" value={[a?.service, a?.vehicleNumber, a?.crew].filter(Boolean).join(" · ")} />
          <Fact label="Pre-alert note" value={a?.preAlertNote} />
          <Fact label="Doctor" value={v.assignedDoctorName ? `Dr ${v.assignedDoctorName}` : "Not assigned"} />
          <Fact label="Seen by doctor" value={v.seenByDoctorAt ? formatDateTime(v.seenByDoctorAt) : null} />
          <Fact label="Registered by" value={v.registeredByName} />
        </HStack>
      </VStack>
    </Card>
  );
}

function ArriveCard({ visit }: { visit: EdVisit }) {
  const arrive = useMarkEdArrived();
  return (
    <Card>
      <VStack gap={10}>
        <Text variant="body-sm" tone="secondary">
          Ambulance pre-alert. Mark them arrived at the door — the department clock starts then.
        </Text>
        {arrive.isError ? <Banner tone="danger" message={apiErrorMessage(arrive.error)} /> : null}
        <Button
          label="Mark arrived"
          fullWidth={false}
          loading={arrive.isPending}
          onPress={() => arrive.mutate(visit.id)}
          icon={<UserCheck size={15} color="#FFFFFF" strokeWidth={2.2} />}
          testID="ed-visit-arrive"
        />
      </VStack>
    </Card>
  );
}

/** Who triaged, when, and — if the nurse disagreed with the algorithm — both levels and why. */
function TriageSummary({ visit: v, clinical }: { visit: EdVisit; clinical: boolean }) {
  const t = v.triage;
  return (
    <Card testID="ed-triage-summary">
      <VStack gap={8}>
        <SectionHeader title="Triage" />
        {!v.esiLevel ? (
          <Text variant="body-sm" tone="secondary">
            Not triaged yet. A nurse or doctor will assess them.
          </Text>
        ) : (
          <>
            <HStack gap={10} align="center" wrap>
              <EsiBadge level={v.esiLevel} label={v.esiLabel} />
              <Text variant="caption" tone="tertiary">
                {formatDateTime(v.triagedAt)}
                {v.triagedByName ? ` by ${v.triagedByName}` : ""}
                {clinical && v.triageCount ? ` · triaged ${v.triageCount} time${v.triageCount === 1 ? "" : "s"}` : ""}
              </Text>
            </HStack>
            {t?.overridden ? (
              <View testID="ed-triage-override">
                <Banner
                  tone="warning"
                  title={`Set to ESI ${v.esiLevel} — the algorithm suggested ESI ${t.suggestedLevel}`}
                  message={t.overrideReason}
                />
              </View>
            ) : null}
            {t?.reasons.map((r) => (
              <Text key={r} variant="body-sm" tone="secondary">
                • {r}
              </Text>
            ))}
          </>
        )}
      </VStack>
    </Card>
  );
}

function AssignCard({ visit }: { visit: EdVisit }) {
  const { data: doctors } = useDoctors();
  const assign = useAssignEdDoctor(visit.id);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  return (
    <Card testID="ed-assign">
      <VStack gap={10}>
        <SectionHeader title="Assign a doctor" subtitle={visit.assignedDoctorName ? `Currently Dr ${visit.assignedDoctorName}` : undefined} />
        <Select
          value={doctorId}
          placeholder="Choose a doctor"
          options={(doctors ?? []).map((d) => ({ value: d.id, label: d.fullName, sublabel: d.specialization || d.designation }))}
          onChange={setDoctorId}
        />
        {assign.isError ? <Banner tone="danger" message={apiErrorMessage(assign.error)} /> : null}
        <Button
          label="Assign"
          fullWidth={false}
          disabled={!doctorId}
          loading={assign.isPending}
          onPress={() => doctorId && assign.mutate(doctorId)}
          testID="ed-assign-submit"
        />
      </VStack>
    </Card>
  );
}

function DoctorCard({ visit }: { visit: EdVisit }) {
  const navigation = useNavigation<any>();
  const start = useStartTreatment(visit.id);
  const patientId = visit.patient.id;
  const taken = visit.status === "in_treatment";

  return (
    <Card testID="ed-doctor">
      <VStack gap={10}>
        <SectionHeader
          title="Treatment"
          subtitle={taken ? `With Dr ${visit.assignedDoctorName} since ${formatDateTime(visit.seenByDoctorAt)}` : "Taking the patient records the door-to-doctor time"}
        />
        {start.isError ? <Banner tone="danger" message={apiErrorMessage(start.error)} /> : null}
        <HStack gap={8} wrap>
          {!taken ? (
            <Button
              label="Take patient"
              fullWidth={false}
              loading={start.isPending}
              onPress={() => start.mutate(undefined)}
              icon={<Stethoscope size={15} color="#FFFFFF" strokeWidth={2.2} />}
              testID="ed-take-patient"
            />
          ) : visit.consultationId ? (
            <Button
              label="Open consultation"
              fullWidth={false}
              // The consultation lives in the clinical stack, whose first screen is the schedule.
              onPress={() =>
                navigation.navigate("Consultation", {
                  screen: "Consultation",
                  params: { id: visit.consultationId, patientId },
                })
              }
              icon={<ClipboardList size={15} color="#FFFFFF" strokeWidth={2.2} />}
              testID="ed-open-consultation"
            />
          ) : null}
          <Button
            label="Medical record"
            variant="secondary"
            fullWidth={false}
            onPress={() => navigation.navigate("MedicalRecord", { patientId })}
            icon={<FileText size={15} color={palette.text.primary} strokeWidth={2.1} />}
            testID="ed-medical-record"
          />
        </HStack>
        {taken && !visit.consultationId ? (
          <Text variant="caption" tone="tertiary">
            No consultation note was opened automatically. Start one from the medical record.
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
}

function DispositionCard({ visit, onDone }: { visit: EdVisit; onDone: (message: string) => void }) {
  const navigation = useNavigation<any>();
  const dispose = useDispose(visit.id);
  const [type, setType] = useState<DispositionType | null>(null);
  const [note, setNote] = useState("");

  const noAdmission = dispose.isError && apiErrorCode(dispose.error) === "NO_ADMISSION";

  const submit = () =>
    type &&
    dispose.mutate(
      { type, ...(note.trim() ? { note: note.trim() } : {}) },
      { onSuccess: () => onDone(`Disposition recorded: ${DISPOSITION_LABELS[type]}.`) },
    );

  return (
    <Card testID="ed-disposition">
      <VStack gap={10}>
        <SectionHeader title="Disposition" subtitle="Where the patient goes. This closes the attendance." />
        <ChoiceChips
          options={DISPOSITIONS.map((d) => ({ key: d, label: DISPOSITION_LABELS[d] }))}
          isSelected={(k) => k === type}
          onPress={(k) => setType(k as DispositionType)}
          testIDPrefix="ed-dispose-type"
        />
        {type === "admitted" ? (
          <Text variant="caption" tone="tertiary">
            Admit the patient to a bed first. This records the admission already made.
          </Text>
        ) : null}
        <TextField label="Note" value={note} onChangeText={setNote} multiline testID="ed-dispose-note" />
        {dispose.isError ? (
          <View testID="ed-dispose-error">
            <Banner
              tone={noAdmission ? "warning" : "danger"}
              title={noAdmission ? "No admission yet" : "Disposition not recorded"}
              message={apiErrorMessage(dispose.error)}
              action={
                noAdmission && hasBanner(visit.patient) ? (
                  <Button
                    label="Admit patient"
                    size="sm"
                    variant="secondary"
                    fullWidth={false}
                    icon={<BedDouble size={14} color={palette.text.primary} strokeWidth={2.1} />}
                    onPress={() =>
                      navigation.navigate("AdmittedPatients", {
                        screen: "AdmitPatient",
                        params: { patient: visit.patient, patientId: visit.patient.id, consultationId: visit.consultationId ?? undefined },
                      })
                    }
                    testID="ed-dispose-admit"
                  />
                ) : undefined
              }
            />
          </View>
        ) : null}
        <Button
          label="Record disposition"
          fullWidth={false}
          disabled={!type}
          loading={dispose.isPending}
          onPress={submit}
          testID="ed-dispose-submit"
        />
      </VStack>
    </Card>
  );
}

function LeftCard({ visit, onDone }: { visit: EdVisit; onDone: (message: string) => void }) {
  const left = useLeftWithoutBeingSeen(visit.id);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setError(null);
    try {
      await left.mutateAsync(undefined);
      onDone("Recorded as left without being seen.");
    } catch (err) {
      setError(
        apiErrorCode(err) === "ALREADY_SEEN"
          ? "A doctor has already seen this patient. Record a disposition instead."
          : apiErrorMessage(err, "Could not record that"),
      );
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Card>
      <VStack gap={10}>
        {error ? <Banner tone="danger" message={error} onDismiss={() => setError(null)} /> : null}
        <HStack gap={10} align="center" justify="space-between" wrap>
          <Text variant="body-sm" tone="secondary" style={{ flex: 1, minWidth: 200 }}>
            Patient no longer in the waiting area and not seen by a doctor?
          </Text>
          <Button
            label="Left without being seen"
            variant="secondary"
            fullWidth={false}
            onPress={() => setConfirming(true)}
            icon={<DoorOpen size={15} color={palette.text.primary} strokeWidth={2.1} />}
            testID="ed-left"
          />
        </HStack>
      </VStack>
      <ConfirmDialog
        visible={confirming}
        title="Left without being seen?"
        message={`${hasBanner(visit.patient) ? visit.patient.fullName : "This patient"} will be taken off the board. The attendance is kept and counted — it cannot be reopened.`}
        confirmLabel="Left without being seen"
        destructive
        loading={left.isPending}
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}

function OutcomeCard({ visit: v }: { visit: EdVisit }) {
  const d = v.disposition;
  return (
    <Card testID="ed-outcome">
      <VStack gap={6}>
        <SectionHeader title="Outcome" />
        <Text variant="label-lg" tone="primary">
          {v.status === "left_without_being_seen" ? "Left without being seen" : d?.type ? DISPOSITION_LABELS[d.type] : ED_STATUS_LABELS[v.status]}
        </Text>
        {d ? (
          <Text variant="caption" tone="tertiary">
            {formatDateTime(d.at)}
            {d.byName ? ` · ${d.byName}` : ""}
          </Text>
        ) : null}
        {d?.note ? (
          <Text variant="body-sm" tone="secondary">
            {d.note}
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
}
