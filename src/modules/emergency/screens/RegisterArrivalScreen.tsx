import React, { useState } from "react";
import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ambulance } from "lucide-react-native";

import { palette } from "@shared/designSystem";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  SectionHeader,
  SearchInput,
  Button,
  Banner,
  TextField,
} from "@shared/ui";
import { apiErrorCode, apiErrorMessage, apiErrorDetails } from "@api/apiClient";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { usePatients } from "@modules/patient/hooks/usePatients";
import type { Patient } from "@modules/patient/types";
import { useRegisterArrival } from "@modules/emergency/hooks/useEmergency";
import {
  ChoiceChips,
  CheckToggle,
} from "@modules/emergency/components/Choices";
import {
  ARRIVAL_MODE_LABELS,
  type ArrivalMode,
  type RegisterArrivalBody,
} from "@modules/emergency/types";

type Kind = "registered" | "unidentified";
type Gender = "male" | "female" | "other";

const MODES = Object.keys(ARRIVAL_MODE_LABELS) as ArrivalMode[];

/**
 * Emergency arrival: who, how, why and MLC only. "Unidentified" needs just sex and an age guess;
 * the server creates a placeholder patient to correct later.
 */
export default function RegisterArrivalScreen() {
  const navigation = useNavigation<any>();

  const [kind, setKind] = useState<Kind>("registered");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);
  const [approxAge, setApproxAge] = useState("");

  const [mode, setMode] = useState<ArrivalMode>("walk_in");
  const [service, setService] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [crew, setCrew] = useState("");
  const [preAlertNote, setPreAlertNote] = useState("");
  const [preAlert, setPreAlert] = useState(false);
  const [expectedIn, setExpectedIn] = useState("");
  const [referredFrom, setReferredFrom] = useState("");

  const [complaint, setComplaint] = useState("");
  const [broughtBy, setBroughtBy] = useState("");
  const [isMlc, setIsMlc] = useState(false);

  const results = usePatients(
    kind === "registered" && !patient && debounced.trim().length >= 2
      ? { search: debounced.trim(), limit: 8 }
      : undefined,
  );
  const register = useRegisterArrival();

  const ageNum = approxAge.trim() === "" ? null : Number(approxAge);
  const ageInvalid =
    ageNum !== null &&
    (!Number.isInteger(ageNum) || ageNum < 0 || ageNum > 120);
  const expectedNum = expectedIn.trim() === "" ? null : Number(expectedIn);
  const expectedInvalid =
    expectedNum !== null &&
    (!Number.isFinite(expectedNum) || expectedNum < 0 || expectedNum > 24 * 60);
  const isPreAlert = mode === "ambulance" && preAlert;

  const ready =
    (kind === "registered"
      ? Boolean(patient)
      : Boolean(gender) && !ageInvalid) &&
    complaint.trim().length >= 3 &&
    !(isPreAlert && expectedInvalid);

  const existing =
    register.isError && apiErrorCode(register.error) === "ALREADY_IN_ED"
      ? apiErrorDetails<{ visitId: string; visitNumber: string }>(
          register.error,
        )
      : undefined;

  const submit = () => {
    const trimmedAmbulance = {
      service: service.trim(),
      vehicleNumber: vehicle.trim(),
      crew: crew.trim(),
      preAlertNote: preAlertNote.trim(),
    };
    const body: RegisterArrivalBody = {
      ...(kind === "registered"
        ? { patientId: patient!.id }
        : {
            unidentified: {
              gender: gender!,
              ...(ageNum !== null ? { approximateAgeYears: ageNum } : {}),
            },
          }),
      arrivalMode: mode,
      chiefComplaint: complaint.trim(),
      ...(broughtBy.trim() ? { broughtBy: broughtBy.trim() } : {}),
      ...(mode === "ambulance" ? { ambulance: trimmedAmbulance } : {}),
      ...(isPreAlert
        ? {
            expected: true,
            ...(expectedNum !== null
              ? {
                  expectedAt: new Date(
                    Date.now() + expectedNum * 60_000,
                  ).toISOString(),
                }
              : {}),
          }
        : {}),
      ...(mode === "referral" && referredFrom.trim()
        ? { referredFrom: referredFrom.trim() }
        : {}),
      ...(isMlc ? { isMlc: true } : {}),
    };
    // Replace so Back cannot return to the filled form and register twice.
    register.mutate(body, {
      onSuccess: (visit) =>
        navigation.replace("EmergencyVisit", { visitId: visit.id }),
    });
  };

  return (
    <Screen
      overline="Emergency"
      title="Register an arrival"
      subtitle="The clock starts when they are registered"
      testID="ed-register"
    >
      <VStack gap={14}>
        <Card>
          <VStack gap={12}>
            <SectionHeader title="Who?" />
            <ChoiceChips
              options={[
                { key: "registered", label: "Registered patient" },
                { key: "unidentified", label: "Unidentified" },
              ]}
              isSelected={(k) => k === kind}
              onPress={(k) => setKind(k as Kind)}
              testIDPrefix="register-kind"
            />

            {kind === "registered" ? (
              patient ? (
                <HStack
                  justify="space-between"
                  align="center"
                  wrap
                  gap={8}
                  testID="register-chosen-patient"
                >
                  <VStack gap={2}>
                    <Text variant="label-lg">{patient.fullName}</Text>
                    <Text variant="caption" tone="secondary">
                      {patient.patientId} · {patient.age} · {patient.gender}
                      {patient.mobile ? ` · ${patient.mobile}` : ""}
                    </Text>
                  </VStack>
                  <Button
                    label="Change patient"
                    size="sm"
                    variant="ghost"
                    fullWidth={false}
                    onPress={() => setPatient(null)}
                    testID="register-change-patient"
                  />
                </HStack>
              ) : (
                <VStack gap={8}>
                  <SearchInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Name, hospital number or mobile"
                    testID="register-patient-search"
                  />
                  {(results.data?.data ?? []).map((p) => (
                    <Button
                      key={p.id}
                      label={`${p.fullName} · ${p.patientId} · ${p.age} · ${p.gender}`}
                      variant="secondary"
                      onPress={() => setPatient(p)}
                      testID={`register-pick-${p.patientId}`}
                    />
                  ))}
                  {debounced.trim().length >= 2 &&
                  results.data &&
                  results.data.data.length === 0 ? (
                    <Text variant="caption" tone="tertiary">
                      No match. If nobody knows who they are, register them as
                      unidentified.
                    </Text>
                  ) : null}
                </VStack>
              )
            ) : (
              <VStack gap={10}>
                <Text variant="label" tone="secondary">
                  Sex
                </Text>
                <ChoiceChips
                  options={[
                    { key: "male", label: "Male" },
                    { key: "female", label: "Female" },
                    { key: "other", label: "Other" },
                  ]}
                  isSelected={(k) => k === gender}
                  onPress={(k) => setGender(k as Gender)}
                  testIDPrefix="register-gender"
                />
                <TextField
                  label="Approximate age"
                  suffix="years"
                  numericField
                  value={approxAge}
                  onChangeText={setApproxAge}
                  error={
                    ageInvalid ? "A whole number from 0 to 120" : undefined
                  }
                  hint="A guess is fine. Leave blank if you cannot tell."
                  containerStyle={{ maxWidth: 260 }}
                  testID="register-approx-age"
                />
              </VStack>
            )}
          </VStack>
        </Card>

        <Card>
          <VStack gap={12}>
            <SectionHeader title="How did they arrive?" />
            <ChoiceChips
              options={MODES.map((m) => ({
                key: m,
                label: ARRIVAL_MODE_LABELS[m],
                icon:
                  m === "ambulance" ? (
                    <Ambulance
                      size={14}
                      color={
                        mode === m
                          ? palette.clinical[700]
                          : palette.text.secondary
                      }
                      strokeWidth={2.1}
                    />
                  ) : undefined,
              }))}
              isSelected={(k) => k === mode}
              onPress={(k) => setMode(k as ArrivalMode)}
              testIDPrefix="register-mode"
            />

            {mode === "ambulance" ? (
              <VStack gap={10}>
                <HStack gap={10} wrap>
                  <TextField
                    label="Ambulance service"
                    value={service}
                    onChangeText={setService}
                    containerStyle={{ flex: 1, minWidth: 180 }}
                    testID="register-ambulance-service"
                  />
                  <TextField
                    label="Vehicle number"
                    value={vehicle}
                    onChangeText={setVehicle}
                    autoCapitalize="characters"
                    containerStyle={{ flex: 1, minWidth: 160 }}
                    testID="register-ambulance-vehicle"
                  />
                </HStack>
                <TextField
                  label="Crew"
                  value={crew}
                  onChangeText={setCrew}
                  testID="register-ambulance-crew"
                />
                <TextField
                  label="Pre-alert note"
                  value={preAlertNote}
                  onChangeText={setPreAlertNote}
                  multiline
                  hint="What the crew called ahead with."
                  testID="register-ambulance-note"
                />
                <CheckToggle
                  label="Pre-alert — not arrived yet"
                  hint="Shows on the board as expected. The clock starts when you mark them arrived."
                  value={preAlert}
                  onChange={setPreAlert}
                  testID="register-prealert"
                />
                {preAlert ? (
                  <TextField
                    label="Expected in"
                    suffix="min"
                    numericField
                    value={expectedIn}
                    onChangeText={setExpectedIn}
                    error={
                      expectedInvalid
                        ? "Minutes from now, up to 24 hours"
                        : undefined
                    }
                    containerStyle={{ maxWidth: 220 }}
                    testID="register-expected-minutes"
                  />
                ) : null}
              </VStack>
            ) : null}

            {mode === "referral" ? (
              <TextField
                label="Referred from"
                value={referredFrom}
                onChangeText={setReferredFrom}
                placeholder="Hospital, clinic or doctor"
                testID="register-referred-from"
              />
            ) : null}
          </VStack>
        </Card>

        <Card>
          <VStack gap={12}>
            <SectionHeader title="Why are they here?" />
            <TextField
              label="Chief complaint"
              required
              value={complaint}
              onChangeText={setComplaint}
              placeholder="Chest pain for 1 hour, fall from a height…"
              error={
                complaint.length > 0 && complaint.trim().length < 3
                  ? "At least 3 characters"
                  : undefined
              }
              testID="register-chief-complaint"
            />
            <TextField
              label="Brought by"
              value={broughtBy}
              onChangeText={setBroughtBy}
              placeholder="Family member, bystander, police officer"
              testID="register-brought-by"
            />
            <CheckToggle
              label="Medico-legal case (MLC)"
              hint="Assault, road accident, poisoning, burns — anything the police must be told about."
              value={isMlc}
              onChange={setIsMlc}
              testID="register-mlc"
            />
          </VStack>
        </Card>

        {register.isError ? (
          <View testID="register-error">
            <Banner
              tone={existing ? "warning" : "danger"}
              title={
                existing
                  ? "Already in the department"
                  : "Arrival not registered"
              }
              message={apiErrorMessage(register.error)}
              action={
                existing ? (
                  <Button
                    label={`Open ${existing.visitNumber}`}
                    size="sm"
                    variant="secondary"
                    fullWidth={false}
                    onPress={() =>
                      navigation.replace("EmergencyVisit", {
                        visitId: existing.visitId,
                      })
                    }
                    testID="register-open-existing"
                  />
                ) : undefined
              }
            />
          </View>
        ) : null}

        <Button
          label={isPreAlert ? "Register pre-alert" : "Register arrival"}
          onPress={submit}
          disabled={!ready}
          loading={register.isPending}
          testID="register-submit"
        />
      </VStack>
    </Screen>
  );
}
