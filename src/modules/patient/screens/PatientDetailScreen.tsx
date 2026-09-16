import React, { useState } from "react";
import { View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  CalendarPlus,
  Phone,
  MapPin,
  ShieldAlert,
  Plus,
  Check,
  TriangleAlert,
} from "lucide-react-native";

import { palette, signal } from "@shared/designSystem";
import { useAuthStore } from "@shared/store/useAuthStore";
import { PERMISSIONS } from "@shared/permissions";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Button,
  Card,
  SectionHeader,
  Banner,
  Skeleton,
  ErrorState,
  StatusChip,
  SignalBadge,
  Select,
  TextField,
  ConfirmDialog,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import {
  usePatient,
  usePatientBanner,
  useSetAllergies,
} from "@modules/patient/hooks/usePatients";
import type { Allergy, AllergySeverity } from "@modules/patient/types";
import { PrintWristbandButton } from "@modules/printing/components/PrintWristbandButton";

const SEVERITIES = [
  { value: "mild", label: "Mild", sublabel: "Rash, mild discomfort" },
  { value: "moderate", label: "Moderate", sublabel: "Needed treatment" },
  { value: "severe", label: "Severe", sublabel: "Serious reaction" },
  { value: "anaphylaxis", label: "Anaphylaxis", sublabel: "Life-threatening" },
];

const SEVERITY_SIGNAL: Record<
  AllergySeverity,
  "critical" | "urgent" | "caution"
> = {
  anaphylaxis: "critical",
  severe: "critical",
  moderate: "urgent",
  mild: "caution",
};

export default function PatientDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { id, justRegistered } = (route.params ?? {}) as {
    id: string;
    justRegistered?: boolean;
  };

  const hasPermission = useAuthStore((s) => s.hasPermission);
  const seesClinical = hasPermission(PERMISSIONS.RECORD_VIEW);
  const canBook = hasPermission(PERMISSIONS.APPOINTMENTS_MANAGE);
  const canRecordAllergies =
    hasPermission(PERMISSIONS.CONSULTATION_MANAGE) ||
    hasPermission(PERMISSIONS.NURSING_NOTES_MANAGE) ||
    hasPermission(PERMISSIONS.PATIENTS_MANAGE);
  // Registration desk, admitting team, or a nurse replacing a band.
  const canPrintWristband =
    hasPermission(PERMISSIONS.PATIENTS_MANAGE) ||
    hasPermission(PERMISSIONS.ADMISSION_MANAGE) ||
    hasPermission(PERMISSIONS.VITALS_RECORD);

  const {
    data: patient,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = usePatient(id);
  const { data: banner } = usePatientBanner(id);

  if (isLoading) {
    return (
      <Screen title="Patient">
        <VStack gap={12}>
          <Skeleton width="40%" height={22} />
          <Skeleton width="70%" height={14} />
          <Card>
            <VStack gap={10}>
              <Skeleton width="90%" height={12} />
              <Skeleton width="60%" height={12} />
            </VStack>
          </Card>
        </VStack>
      </Screen>
    );
  }

  if (isError || !patient) {
    return (
      <Screen title="Patient">
        <ErrorState
          error={error}
          title="Couldn't load this patient"
          onRetry={refetch}
        />
      </Screen>
    );
  }

  return (
    <Screen
      // Identity band, rendered outside the scroll view so it never scrolls away.
      patient={banner ?? undefined}
      overline="Front office"
      title={patient.fullName}
      subtitle={`${patient.patientId} · registered ${new Date(patient.registeredAt).toLocaleDateString("en-IN")}`}
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="patient-detail"
      right={
        canBook || canPrintWristband ? (
          <HStack gap={8} align="flex-start" wrap>
            {canPrintWristband ? (
              <PrintWristbandButton
                patient={patient}
                banner={banner ?? undefined}
              />
            ) : null}
            {canBook ? (
              <Button
                label="Book appointment"
                fullWidth={false}
                testID="book-from-patient"
                icon={
                  <CalendarPlus size={16} color="#FFFFFF" strokeWidth={2.2} />
                }
                onPress={() =>
                  navigation.navigate("BookAppointment", {
                    patientId: patient.id,
                  })
                }
              />
            ) : null}
          </HStack>
        ) : undefined
      }
    >
      <VStack gap={16}>
        {justRegistered ? (
          <Banner
            tone="success"
            title="Registered"
            message={`${patient.fullName} has been given patient ID ${patient.patientId}. That ID stays with them and cannot be changed.`}
          />
        ) : null}

        {seesClinical ? (
          <AllergySection
            patientId={patient.id}
            allergies={patient.allergies ?? []}
            recorded={Boolean(patient.allergiesRecorded)}
            canEdit={canRecordAllergies}
          />
        ) : null}

        <Card>
          <SectionHeader title="Details" />
          <VStack gap={0}>
            <Detail label="Patient ID" value={patient.patientId} tabular />
            <Detail
              label="Age"
              value={`${patient.age}${patient.ageIsApproximate ? " (stated, not from a date of birth)" : ""}`}
            />
            <Detail label="Gender" value={patient.gender} />
            {seesClinical && patient.bloodGroup ? (
              <Detail
                label="Blood group"
                value={
                  patient.bloodGroup === "unknown"
                    ? "Not known"
                    : patient.bloodGroup
                }
              />
            ) : null}
            <Detail
              label="Status"
              value={<StatusChip status={patient.status} size="sm" />}
            />
            <Detail
              label="Visits"
              value={String(patient.visitCount || 0)}
              tabular
            />
          </VStack>
        </Card>

        <Card>
          <SectionHeader title="Contact" />
          <VStack gap={0}>
            <Detail
              label="Mobile"
              value={patient.mobile}
              tabular
              icon={
                <Phone
                  size={14}
                  color={palette.text.tertiary}
                  strokeWidth={2}
                />
              }
            />
            {patient.alternatePhone ? (
              <Detail
                label="Alternate"
                value={patient.alternatePhone}
                tabular
              />
            ) : null}
            {patient.email ? (
              <Detail label="Email" value={patient.email} />
            ) : null}
            <Detail
              label="Address"
              value={
                [
                  patient.address.line1,
                  patient.address.city,
                  patient.address.state,
                  patient.address.pincode,
                ]
                  .filter(Boolean)
                  .join(", ") || "Not recorded"
              }
              icon={
                <MapPin
                  size={14}
                  color={palette.text.tertiary}
                  strokeWidth={2}
                />
              }
            />
          </VStack>
        </Card>

        <Card>
          <SectionHeader
            title="Emergency contact"
            subtitle="Who the hospital calls if something happens"
          />
          {patient.emergencyContact.name ? (
            <VStack gap={0}>
              <Detail label="Name" value={patient.emergencyContact.name} />
              <Detail
                label="Relationship"
                value={patient.emergencyContact.relationship || "Not stated"}
              />
              <Detail
                label="Phone"
                value={patient.emergencyContact.phone || "—"}
                tabular
              />
            </VStack>
          ) : (
            <Banner
              tone="warning"
              message="No emergency contact is recorded for this patient. Ask at their next visit."
            />
          )}
        </Card>
      </VStack>
    </Screen>
  );
}

/**
 * Allergy panel with three states: known allergies, recorded "none known", and not recorded.
 * "Not recorded" must never look like "none" (clinical safety).
 */
function AllergySection({
  patientId,
  allergies,
  recorded,
  canEdit,
}: {
  patientId: string;
  allergies: Allergy[];
  recorded: boolean;
  canEdit: boolean;
}) {
  const setAllergies = useSetAllergies(patientId);
  const [adding, setAdding] = useState(false);
  const [substance, setSubstance] = useState("");
  const [severity, setSeverity] = useState<string | null>(null);
  const [reaction, setReaction] = useState("");
  const [confirmNone, setConfirmNone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!substance.trim() || !severity) return;
    setError(null);
    try {
      await setAllergies.mutateAsync({
        allergies: [
          ...allergies.map((a) => ({
            substance: a.substance,
            severity: a.severity,
            reaction: a.reaction,
            category: a.category,
          })),
          {
            substance: substance.trim(),
            severity: severity as AllergySeverity,
            reaction: reaction.trim() || undefined,
            category: "drug",
          },
        ],
        recorded: true,
      });
      setSubstance("");
      setSeverity(null);
      setReaction("");
      setAdding(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save that allergy"));
    }
  };

  const recordNone = async () => {
    setConfirmNone(false);
    setError(null);
    try {
      await setAllergies.mutateAsync({ allergies: [], recorded: true });
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save"));
    }
  };

  return (
    <Card
      accentColor={
        allergies.some(
          (a) => a.severity === "severe" || a.severity === "anaphylaxis",
        )
          ? signal.critical.color
          : undefined
      }
    >
      <SectionHeader
        title="Allergies"
        right={
          canEdit && !adding ? (
            <Button
              label="Add"
              variant="secondary"
              size="sm"
              fullWidth={false}
              testID="add-allergy"
              icon={
                <Plus
                  size={14}
                  color={palette.text.primary}
                  strokeWidth={2.2}
                />
              }
              onPress={() => setAdding(true)}
            />
          ) : undefined
        }
      />

      {error ? (
        <Banner tone="danger" message={error} style={{ marginBottom: 10 }} />
      ) : null}

      {!recorded ? (
        <VStack gap={10}>
          <HStack gap={8} align="center">
            <ShieldAlert
              size={17}
              color={palette.warning.text}
              strokeWidth={2.2}
            />
            <Text
              variant="label"
              weight="600"
              style={{ color: palette.warning.text, flex: 1 }}
            >
              Allergies have not been recorded
            </Text>
          </HStack>
          <Text variant="body-sm" tone="secondary">
            Nobody has asked yet. This is not the same as having none — until
            someone asks and records the answer, treat this patient as having
            unknown allergy status.
          </Text>
          {canEdit ? (
            <HStack gap={8} wrap>
              <Button
                label="Record: no known allergies"
                variant="secondary"
                size="sm"
                fullWidth={false}
                testID="record-no-allergies"
                icon={
                  <Check
                    size={14}
                    color={palette.text.primary}
                    strokeWidth={2.2}
                  />
                }
                onPress={() => setConfirmNone(true)}
              />
            </HStack>
          ) : null}
        </VStack>
      ) : allergies.length === 0 ? (
        <HStack gap={8} align="center">
          <Check size={16} color={signal.normal.text} strokeWidth={2.4} />
          <Text
            variant="label"
            weight="600"
            style={{ color: signal.normal.text }}
          >
            No known allergies
          </Text>
          <Text variant="caption" tone="tertiary">
            — asked and recorded
          </Text>
        </HStack>
      ) : (
        <VStack gap={8}>
          {allergies.map((a) => (
            <View key={a.id ?? a.substance}>
              <HStack gap={10} align="center" wrap>
                <TriangleAlert
                  size={15}
                  color={signal.critical.color}
                  strokeWidth={2.3}
                />
                <Text variant="label-lg" tone="primary">
                  {a.substance}
                </Text>
                <SignalBadge
                  level={SEVERITY_SIGNAL[a.severity]}
                  label={a.severity}
                  size="sm"
                />
              </HStack>
              {a.reaction ? (
                <Text
                  variant="body-sm"
                  tone="secondary"
                  style={{ marginLeft: 25 }}
                >
                  {a.reaction}
                </Text>
              ) : null}
              {a.notedByName ? (
                <Text
                  variant="caption"
                  tone="tertiary"
                  style={{ marginLeft: 25 }}
                >
                  Noted by {a.notedByName}
                  {a.notedAt
                    ? ` · ${new Date(a.notedAt).toLocaleDateString("en-IN")}`
                    : ""}
                </Text>
              ) : null}
            </View>
          ))}
        </VStack>
      )}

      {adding ? (
        <VStack gap={12} style={{ marginTop: 14 }}>
          <TextField
            label="Substance"
            value={substance}
            onChangeText={setSubstance}
            placeholder="Penicillin, sulfa, peanuts…"
            testID="allergy-substance"
            autoFocus
          />
          <Select
            label="Severity"
            required
            value={severity}
            options={SEVERITIES}
            placeholder="How bad was the reaction?"
            onChange={setSeverity}
          />
          <TextField
            label="Reaction"
            value={reaction}
            onChangeText={setReaction}
            placeholder="Throat swelling, 2019"
            hint="What happened, and roughly when."
          />
          <HStack gap={8} justify="flex-end">
            <Button
              label="Cancel"
              variant="secondary"
              size="sm"
              fullWidth={false}
              onPress={() => setAdding(false)}
            />
            <Button
              label="Save allergy"
              size="sm"
              fullWidth={false}
              loading={setAllergies.isPending}
              disabled={!substance.trim() || !severity}
              onPress={add}
              testID="save-allergy"
            />
          </HStack>
        </VStack>
      ) : null}

      <ConfirmDialog
        visible={confirmNone}
        title="Record no known allergies?"
        message="This is a clinical statement that goes on the patient's identity band and into prescribing checks. Only record it if you have actually asked."
        confirmLabel="Yes, I asked"
        loading={setAllergies.isPending}
        onConfirm={recordNone}
        onCancel={() => setConfirmNone(false)}
      />
    </Card>
  );
}

function Detail({
  label,
  value,
  tabular,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  tabular?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <HStack
      gap={12}
      align="center"
      style={{
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: palette.border.subtle,
      }}
    >
      <View style={{ width: 130 }}>
        <HStack gap={6} align="center">
          {icon}
          <Text variant="label-sm" tone="tertiary">
            {label}
          </Text>
        </HStack>
      </View>
      {typeof value === "string" ? (
        <Text
          variant="body"
          tone="primary"
          tabular={tabular}
          style={{ flex: 1 }}
        >
          {value}
        </Text>
      ) : (
        <View style={{ flex: 1 }}>{value}</View>
      )}
    </HStack>
  );
}
