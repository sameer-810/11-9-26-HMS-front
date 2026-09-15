import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ambulance, AlarmClock, ClipboardList, Users, Scale, UserPlus, UserCheck, Siren, Stethoscope } from "lucide-react-native";

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
  Banner,
  Skeleton,
  ErrorState,
  EmptyState,
  StatTile,
  SectionHeader,
  useBreakpoint,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { formatDuration, formatTimeOnly } from "@shared/format";
import { useEmergencyBoard, useMarkEdArrived } from "@modules/emergency/hooks/useEmergency";
import { EsiBadge } from "@modules/emergency/components/EsiBadge";
import { ARRIVAL_MODE_LABELS, hasBanner, type EdVisit } from "@modules/emergency/types";

/**
 * The emergency department board.
 *
 * Ordered by the server — untriaged first, then acuity, then longest wait —
 * and deliberately never re-sorted here. Arrival order is how the chest pain
 * waits behind four sprained ankles, and a client sort is one innocent
 * "sort by time" away from reintroducing it.
 */
export default function EmergencyBoardScreen() {
  const navigation = useNavigation<any>();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRunDepartment = hasPermission(PERMISSIONS.TRIAGE_MANAGE);
  const { isWide } = useBreakpoint();

  const [error, setError] = useState<string | null>(null);
  const { data, isLoading, isError, error: loadError, refetch, isRefetching } = useEmergencyBoard();
  const markArrived = useMarkEdArrived();

  const expected = data?.expected ?? [];
  const active = data?.active ?? [];
  const waitingTriage = active.filter((v) => !v.esiLevel).length;
  const overTarget = active.filter((v) => v.overTarget).length;

  const open = (v: EdVisit) => navigation.navigate("EmergencyVisit", { visitId: v.id });

  const arrive = async (v: EdVisit) => {
    setError(null);
    try {
      await markArrived.mutateAsync(v.id);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not mark the ambulance arrived"));
    }
  };

  return (
    <Screen
      overline="Emergency"
      title="Department board"
      subtitle="Refreshes every 30 seconds"
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="ed-board"
      right={
        canRunDepartment ? (
          <Button
            label="Register arrival"
            fullWidth={false}
            onPress={() => navigation.navigate("RegisterArrival")}
            icon={<UserPlus size={15} color="#FFFFFF" strokeWidth={2.2} />}
            testID="ed-register-button"
          />
        ) : undefined
      }
    >
      <VStack gap={16}>
        {error ? <Banner tone="danger" message={error} onDismiss={() => setError(null)} /> : null}

        <HStack gap={10} wrap>
          <StatTile label="Expected ambulances" value={expected.length} icon={Ambulance} accent="clinical" />
          <StatTile
            label="Waiting triage"
            value={waitingTriage}
            icon={ClipboardList}
            accent="amber"
            attention={waitingTriage > 0}
          />
          <StatTile label="In department" value={active.length} icon={Users} accent="teal" />
          <StatTile label="Over target" value={overTarget} icon={AlarmClock} accent="rose" attention={overTarget > 0} />
        </HStack>

        {isError ? (
          <ErrorState error={loadError} title="Couldn't load the board" onRetry={refetch} />
        ) : isLoading ? (
          <VStack gap={8}>
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} compact>
                <Skeleton width="70%" height={16} />
              </Card>
            ))}
          </VStack>
        ) : (
          <>
            {expected.length ? (
              <VStack gap={8}>
                <SectionHeader title="Expected" subtitle="Ambulance pre-alerts, not yet at the door" />
                {expected.map((v) => (
                  <ExpectedRow
                    key={v.id}
                    visit={v}
                    canArrive={canRunDepartment}
                    busy={markArrived.isPending}
                    onArrive={() => arrive(v)}
                    onOpen={() => open(v)}
                  />
                ))}
              </VStack>
            ) : null}

            <VStack gap={8}>
              <SectionHeader title="In the department" subtitle="Untriaged first, then by acuity, then longest wait" />
              {active.length === 0 ? (
                <EmptyState
                  icon={Siren}
                  title="Nobody in the department"
                  message="Arrivals appear here the moment reception registers them."
                />
              ) : (
                <VStack gap={isWide ? 0 : 8} style={isWide ? styles.table : undefined}>
                  {isWide ? <HeaderRow /> : null}
                  {active.map((v) => (
                    <ActiveRow key={v.id} visit={v} wide={isWide} onOpen={() => open(v)} />
                  ))}
                </VStack>
              )}
            </VStack>
          </>
        )}
      </VStack>
    </Screen>
  );
}

function ExpectedRow({
  visit: v,
  canArrive,
  busy,
  onArrive,
  onOpen,
}: {
  visit: EdVisit;
  canArrive: boolean;
  busy: boolean;
  onArrive: () => void;
  onOpen: () => void;
}) {
  const a = v.ambulance;
  const crew = [a?.service, a?.vehicleNumber].filter(Boolean).join(" · ");
  return (
    <Card compact onPress={onOpen} accentColor={palette.clinical[600]} testID={`ed-expected-${v.visitNumber}`}>
      <HStack gap={12} align="center" wrap>
        <Ambulance size={20} color={palette.clinical[700]} strokeWidth={2} />
        <VStack gap={2} flex={1} style={{ minWidth: 200 }}>
          <Text variant="label-lg" tone="primary">
            {v.chiefComplaint}
          </Text>
          <Text variant="caption" tone="tertiary" numberOfLines={2}>
            {v.visitNumber} · {patientLine(v)}
            {crew ? ` · ${crew}` : ""}
            {a?.preAlertNote ? ` · ${a.preAlertNote}` : ""}
          </Text>
        </VStack>
        <Text variant="label-sm" tone="secondary" tabular>
          {v.expectedAt ? `Due ${formatTimeOnly(v.expectedAt)}` : "Time not given"}
        </Text>
        {canArrive ? (
          <Button
            label="Arrived"
            size="sm"
            fullWidth={false}
            disabled={busy}
            onPress={onArrive}
            icon={<UserCheck size={14} color="#FFFFFF" strokeWidth={2.2} />}
            testID={`ed-arrive-${v.visitNumber}`}
          />
        ) : null}
      </HStack>
    </Card>
  );
}

const COL = { esi: 140, visit: 120, patient: 200, arrival: 120, wait: 170, doctor: 150 } as const;

function HeaderRow() {
  const h = (label: string, width?: number) => (
    <Text variant="label-sm" tone="tertiary" style={width ? { width } : { flex: 1, minWidth: 160 }}>
      {label}
    </Text>
  );
  return (
    <HStack gap={12} align="center" style={styles.headerRow}>
      {h("Acuity", COL.esi)}
      {h("Visit", COL.visit)}
      {h("Patient", COL.patient)}
      {h("Chief complaint")}
      {h("Arrival", COL.arrival)}
      {h("Wait", COL.wait)}
      {h("Doctor", COL.doctor)}
    </HStack>
  );
}

function ActiveRow({ visit: v, wide, onOpen }: { visit: EdVisit; wide: boolean; onOpen: () => void }) {
  const wait = waitSummary(v);
  const accent = v.overTarget ? signal.critical.color : !v.esiLevel ? palette.ink[900] : undefined;

  const badge = <EsiBadge level={v.esiLevel} label={wide ? null : v.esiLabel} size="sm" testID={`ed-esi-${v.visitNumber}`} />;

  const patient = (
    <HStack gap={6} align="center" wrap>
      <Text variant="label-lg" tone="primary" numberOfLines={1}>
        {hasBanner(v.patient) ? v.patient.fullName : "Patient"}
      </Text>
      {v.isMlc ? <MlcFlag /> : null}
    </HStack>
  );

  const arrival = (
    <HStack gap={5} align="center">
      {v.arrivalMode === "ambulance" ? (
        // Decorative: the words beside it already say "Ambulance". A label
        // passed to the icon lands on every <path> inside the SVG, where it is
        // not allowed and gets read out once per stroke.
        <Ambulance size={14} color={palette.clinical[700]} strokeWidth={2.1} aria-hidden />
      ) : null}
      <Text variant="caption" tone="secondary" tabular numberOfLines={1}>
        {ARRIVAL_MODE_LABELS[v.arrivalMode]} · {formatTimeOnly(v.arrivedAt)}
      </Text>
    </HStack>
  );

  const waitCell = (
    <VStack gap={1}>
      <HStack gap={4} align="center">
        {v.overTarget ? <AlarmClock size={13} color={signal.critical.color} strokeWidth={2.4} /> : null}
        <Text
          variant="label-sm"
          weight={v.overTarget ? "600" : "500"}
          tabular
          style={{ color: v.overTarget ? signal.critical.text : palette.text.secondary }}
          testID={`ed-wait-${v.visitNumber}`}
        >
          {wait.primary}
        </Text>
      </HStack>
      {wait.secondary ? (
        <Text variant="caption" tone="tertiary" tabular>
          {wait.secondary}
        </Text>
      ) : null}
    </VStack>
  );

  const doctor = (
    <HStack gap={5} align="center">
      {v.status === "in_treatment" ? <Stethoscope size={13} color={palette.clinical[600]} strokeWidth={2.1} /> : null}
      <Text variant="caption" tone={v.assignedDoctorName ? "secondary" : "tertiary"} numberOfLines={1}>
        {v.assignedDoctorName ? `Dr ${v.assignedDoctorName}` : "No doctor yet"}
      </Text>
    </HStack>
  );

  if (wide) {
    return (
      <Card compact onPress={onOpen} accentColor={accent} style={styles.wideRow} testID={`ed-row-${v.visitNumber}`}>
        <HStack gap={12} align="center">
          <View style={{ width: COL.esi }}>{badge}</View>
          {/* One line: a visit number broken at its hyphen reads as two numbers. */}
          <Text variant="label-sm" tone="secondary" tabular numberOfLines={1} style={{ width: COL.visit }}>
            {v.visitNumber}
          </Text>
          <VStack gap={1} style={{ width: COL.patient }}>
            {patient}
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {ageSex(v)}
            </Text>
          </VStack>
          <Text variant="body-sm" tone="primary" numberOfLines={2} style={{ flex: 1, minWidth: 160 }}>
            {v.chiefComplaint}
          </Text>
          <View style={{ width: COL.arrival }}>{arrival}</View>
          <View style={{ width: COL.wait }}>{waitCell}</View>
          <View style={{ width: COL.doctor }}>{doctor}</View>
        </HStack>
      </Card>
    );
  }

  return (
    <Card compact onPress={onOpen} accentColor={accent} testID={`ed-row-${v.visitNumber}`}>
      <VStack gap={8}>
        <HStack gap={8} align="center" justify="space-between" wrap>
          {badge}
          <Text variant="label-sm" tone="tertiary" tabular>
            {v.visitNumber}
          </Text>
        </HStack>
        <VStack gap={2}>
          {patient}
          <Text variant="caption" tone="tertiary">
            {ageSex(v)}
          </Text>
        </VStack>
        <Text variant="body-sm" tone="primary">
          {v.chiefComplaint}
        </Text>
        <HStack gap={12} align="center" justify="space-between" wrap>
          {arrival}
          {waitCell}
        </HStack>
        {doctor}
      </VStack>
    </Card>
  );
}

function MlcFlag() {
  return (
    <View style={styles.mlc} accessibilityLabel="Medico-legal case">
      <Scale size={11} color={palette.warning.text} strokeWidth={2.2} />
      <Text variant="label-sm" weight="600" style={{ color: palette.warning.text }}>
        MLC
      </Text>
    </View>
  );
}

const ageSex = (v: EdVisit) => (hasBanner(v.patient) ? `${v.patient.age} · ${v.patient.gender}` : "");
const patientLine = (v: EdVisit) => (hasBanner(v.patient) ? `${v.patient.fullName}, ${ageSex(v)}` : "Patient");

/**
 * Waiting is shown against the level's target, because "25 min" means nothing
 * on its own — it is fine for an ESI 4 and an incident for an ESI 2.
 */
function waitSummary(v: EdVisit): { primary: string; secondary?: string } {
  const wait = v.waitMinutes ?? null;
  if (wait === null) return { primary: "—" };
  if (!v.esiLevel) return { primary: `Waiting ${formatDuration(wait)}`, secondary: "Not triaged" };
  const target = v.targetMinutes ?? 0;
  const targetText = target === 0 ? "immediate" : formatDuration(target);
  if (v.overTarget) {
    return { primary: `Over target by ${formatDuration(wait - target)}`, secondary: `Waited ${formatDuration(wait)} · target ${targetText}` };
  }
  if (v.seenByDoctorAt) return { primary: `Seen · ${formatDuration(wait)} in dept` };
  return { primary: `${formatDuration(wait)} of ${targetText}`, secondary: "Within target" };
}

const styles = StyleSheet.create({
  table: { gap: 6 },
  headerRow: { paddingHorizontal: 15, paddingVertical: 6 },
  wideRow: { borderRadius: radius.md },
  mlc: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    backgroundColor: palette.warning.bg,
    borderColor: palette.warning.border,
  },
});
