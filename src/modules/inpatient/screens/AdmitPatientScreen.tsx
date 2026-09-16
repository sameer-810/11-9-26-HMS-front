import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { BedDouble } from "lucide-react-native";

import { palette, radius, signal } from "@shared/designSystem";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  Button,
  TextField,
  Select,
  SearchInput,
  ErrorState,
  EmptyState,
} from "@shared/ui";
import { usePatients } from "@modules/patient/hooks/usePatients";
import { useSelectableBeds } from "@modules/inpatient/hooks/useBeds";
import { useAdmit } from "@modules/inpatient/hooks/useInpatient";
import type { PatientBanner } from "@modules/patient/types";

/**
 * IP-01: admit a patient.
 *
 * ---------------------------------------------------------------------------
 * Bed choice is the whole screen
 * ---------------------------------------------------------------------------
 * Everything else here is text. The one thing that can go wrong in a way that
 * matters is the bed: pick one that has just been taken and a second patient is
 * sent to an occupied bay. So the bed list is never cached, unavailable beds
 * are shown with their reason rather than hidden, and a losing race comes back
 * as "someone was admitted to that bed a moment ago" rather than a generic
 * failure.
 */

const ADMISSION_TYPES = [
  { value: "planned", label: "Planned" },
  { value: "emergency", label: "Emergency" },
  { value: "transfer_in", label: "Transfer in from another hospital" },
  { value: "day_care", label: "Day care" },
];

export default function AdmitPatientScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const [search, setSearch] = useState("");
  const [patient, setPatient] = useState<PatientBanner | null>(route.params?.patient ?? null);
  const [bedId, setBedId] = useState<string | null>(null);
  // US-17: admitting from a recommendation starts from the doctor's reason.
  const [reason, setReason] = useState<string>(route.params?.reason ?? "");
  const [provisionalDiagnosis, setProvisionalDiagnosis] = useState("");
  const [expectedStay, setExpectedStay] = useState("");
  const [admissionType, setAdmissionType] = useState("planned");

  const results = usePatients(search.length >= 2 ? { search, limit: 8 } : undefined);
  // Gender is passed so a single-sex ward is refused HERE, in the list, rather
  // than after the doctor has typed a reason and pressed admit.
  const beds = useSelectableBeds(patient ? { gender: patient.gender } : {});
  const admit = useAdmit();

  const ready = Boolean(patient && bedId && reason.trim().length >= 3);

  const submit = () => {
    admit.mutate(
      {
        patientId: patient!.id,
        bedId: bedId!,
        reason: reason.trim(),
        provisionalDiagnosis: provisionalDiagnosis.trim() || undefined,
        expectedStayDays: expectedStay ? Number(expectedStay) : undefined,
        admissionType: admissionType as "planned",
        consultationId: route.params?.consultationId,
      },
      {
        onSuccess: (admission) =>
          navigation.replace("Bedside", { admissionId: admission.id }),
      },
    );
  };

  return (
    <Screen title="Admit a patient" subtitle="IP-01" scroll>
      <VStack gap={16}>
        {admit.isError ? (
          <View testID="admit-error">
            <ErrorState error={admit.error} title="Not admitted" />
          </View>
        ) : null}

        <Card>
          <VStack gap={12}>
            <Text variant="h4">Who is being admitted?</Text>

            {patient ? (
              <View style={styles.chosen} testID="chosen-patient">
                <HStack justify="space-between" align="center" wrap gap={8}>
                  <VStack gap={2}>
                    <Text variant="label-lg">{patient.fullName}</Text>
                    <Text variant="caption" tone="secondary">
                      {patient.patientId} · {patient.age} · {patient.gender}
                    </Text>
                    {patient.allergiesRecorded ? (
                      patient.allergies.length > 0 ? (
                        <Text variant="caption" style={{ color: signal.critical.text }}>
                          Allergic to {patient.allergies.map((a) => a.substance).join(", ")}
                        </Text>
                      ) : (
                        <Text variant="caption" tone="tertiary">
                          No known allergies
                        </Text>
                      )
                    ) : (
                      <Text variant="caption" style={{ color: signal.caution.text }}>
                        Allergies not recorded — ask before the first drug round
                      </Text>
                    )}
                  </VStack>
                  <Button
                    label="Change"
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      setPatient(null);
                      setBedId(null);
                    }}
                  />
                </HStack>
              </View>
            ) : (
              <VStack gap={10}>
                <SearchInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Name, hospital number or mobile"
                  testID="admit-patient-search"
                />
                {search.length >= 2 ? (
                  (results.data?.data ?? []).length === 0 ? (
                    <Text variant="caption" tone="secondary">
                      No patient found. Register them first.
                    </Text>
                  ) : (
                    <VStack gap={6}>
                      {(results.data?.data ?? []).slice(0, 8).map((p) => (
                        <Button
                          key={p.id}
                          label={`${p.fullName} · ${p.patientId} · ${p.age}`}
                          variant="secondary"
                          onPress={() => {
                            setPatient(p as PatientBanner);
                            setSearch("");
                          }}
                          testID={`pick-patient-${p.patientId}`}
                        />
                      ))}
                    </VStack>
                  )
                ) : null}
              </VStack>
            )}
          </VStack>
        </Card>

        <Card>
          <VStack gap={12}>
            <Text variant="h4">Which bed?</Text>
            {beds.isError ? (
              <ErrorState error={beds.error} onRetry={() => beds.refetch()} />
            ) : beds.data.length === 0 ? (
              <EmptyState
                icon={BedDouble}
                title="No beds configured"
                message="An administrator sets up wards, rooms and beds before anyone can be admitted."
              />
            ) : (
              <Select
                label="Bed"
                value={bedId}
                options={beds.data}
                onChange={setBedId}
                placeholder="Choose a free bed"
                hint="Occupied and out-of-service beds are listed with the reason, so you can see the whole ward."
              />
            )}
          </VStack>
        </Card>

        <Card>
          <VStack gap={12}>
            <Text variant="h4">Why?</Text>
            <TextField
              label="Reason for admission"
              required
              value={reason}
              onChangeText={setReason}
              multiline
              testID="admit-reason"
            />
            <TextField
              label="Provisional diagnosis"
              value={provisionalDiagnosis}
              onChangeText={setProvisionalDiagnosis}
              testID="admit-diagnosis"
            />
            <HStack gap={10}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Expected stay"
                  suffix="days"
                  numericField
                  value={expectedStay}
                  onChangeText={setExpectedStay}
                  testID="admit-stay"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Select
                  label="Type"
                  value={admissionType}
                  options={ADMISSION_TYPES}
                  onChange={setAdmissionType}
                />
              </View>
            </HStack>
          </VStack>
        </Card>

        <Button
          label={admit.isPending ? "Admitting…" : "Admit"}
          onPress={submit}
          disabled={!ready || admit.isPending}
          testID="admit-submit"
        />
      </VStack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chosen: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.sunken,
  },
});
