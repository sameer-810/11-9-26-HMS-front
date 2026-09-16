import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Phone, User, Calendar, MapPin, Lock } from "lucide-react-native";

import { palette } from "@shared/designSystem";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Button,
  Card,
  SectionHeader,
  Select,
  Banner,
  Skeleton,
  ErrorState,
} from "@shared/ui";
import { ControlledTextField } from "@shared/form/ControlledTextField";
import { apiErrorCode, apiErrorMessage } from "@api/apiClient";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import {
  useCheckDuplicates,
  usePatient,
  usePatientBanner,
  useUpdatePatient,
} from "@modules/patient/hooks/usePatients";
import {
  registerPatientSchema,
  type RegisterPatientForm,
} from "@modules/patient/patient.validation";
import { DuplicateWarning } from "@modules/patient/components/DuplicateWarning";
import { openScreen } from "@modules/patient/openScreen";
import type {
  DuplicateMatch,
  Patient,
  RegisterPatientPayload,
} from "@modules/patient/types";

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

/** Edit a registered patient's details (reception). The patient ID is never editable. */
export default function EditPatientScreen() {
  const route = useRoute<any>();
  const { id } = (route.params ?? {}) as { id: string };
  const { data: patient, isLoading, isError, error, refetch } = usePatient(id);
  const { data: banner } = usePatientBanner(id);

  if (isLoading) {
    return (
      <Screen title="Edit details">
        <Card>
          <VStack gap={12}>
            <Skeleton width="45%" height={18} />
            <Skeleton width="80%" height={14} />
            <Skeleton width="60%" height={14} />
          </VStack>
        </Card>
      </Screen>
    );
  }

  if (isError || !patient) {
    return (
      <Screen title="Edit details">
        <ErrorState
          error={error}
          title="Couldn't load this patient"
          onRetry={refetch}
        />
      </Screen>
    );
  }

  // Keyed so the form's starting values are the record as loaded.
  return (
    <EditPatientForm
      key={patient.id}
      patient={patient}
      banner={banner ?? undefined}
    />
  );
}

function formValuesFor(p: Patient): RegisterPatientForm {
  return {
    firstName: p.firstName,
    lastName: p.lastName || "",
    dateOfBirth: p.dateOfBirth ? String(p.dateOfBirth).slice(0, 10) : "",
    approximateAgeYears: (p.dateOfBirth || p.ageYears === null
      ? ""
      : p.ageYears) as never,
    gender: p.gender,
    mobile: p.mobile,
    alternatePhone: p.alternatePhone || "",
    email: p.email || "",
    addressLine1: p.address?.line1 || "",
    city: p.address?.city || "",
    state: p.address?.state || "",
    pincode: p.address?.pincode || "",
    emergencyName: p.emergencyContact?.name || "",
    emergencyRelationship: p.emergencyContact?.relationship || "",
    emergencyPhone: p.emergencyContact?.phone || "",
    abhaNumber: p.abhaNumber || "",
    isMlc: p.isMlc,
  };
}

/** The API shape of a form, so two of them can be compared field by field. */
function toPayload(
  v: RegisterPatientForm,
  p: Patient,
): Partial<RegisterPatientPayload> {
  return {
    firstName: v.firstName.trim(),
    lastName: (v.lastName || "").trim(),
    gender: v.gender,
    mobile: v.mobile.trim(),
    alternatePhone: (v.alternatePhone || "").trim(),
    email: (v.email || "").trim(),
    address: {
      line1: (v.addressLine1 || "").trim(),
      // Not on this form; sent back unchanged so the address is not cut short.
      line2: p.address?.line2 || "",
      city: (v.city || "").trim(),
      state: (v.state || "").trim(),
      pincode: (v.pincode || "").trim(),
      country: p.address?.country || "",
    },
    emergencyContact: {
      name: (v.emergencyName || "").trim(),
      relationship: (v.emergencyRelationship || "").trim(),
      phone: (v.emergencyPhone || "").trim(),
    },
    abhaNumber: (v.abhaNumber || "").trim(),
    ...(v.dateOfBirth
      ? { dateOfBirth: v.dateOfBirth.trim() }
      : v.approximateAgeYears !== "" && v.approximateAgeYears !== undefined
        ? { approximateAgeYears: Number(v.approximateAgeYears) }
        : {}),
  };
}

function EditPatientForm({
  patient,
  banner,
}: {
  patient: Patient;
  banner?: React.ComponentProps<typeof Screen>["patient"];
}) {
  const navigation = useNavigation<any>();
  const update = useUpdatePatient(patient.id);
  const checkDuplicates = useCheckDuplicates();

  const initial = useMemo(() => formValuesFor(patient), [patient]);
  const hasDob = Boolean(initial.dateOfBirth);

  const [gender, setGender] = useState<string | null>(patient.gender);
  const [error, setError] = useState<string | null>(null);
  const [unchanged, setUnchanged] = useState(false);
  const [dupResult, setDupResult] = useState<{
    key: string;
    matches: DuplicateMatch[];
  } | null>(null);

  const { control, handleSubmit, setValue, formState } =
    useForm<RegisterPatientForm>({
      resolver: zodResolver(registerPatientSchema),
      mode: "onTouched",
      defaultValues: initial,
    });

  // A changed name or number can collide with someone else on file; worth saying before saving.
  const watched = useWatch({ control });
  const checkKey = useDebouncedValue(
    `${watched.firstName || ""}|${watched.lastName || ""}|${watched.mobile || ""}`,
    500,
  );
  const [dFirst, dLast, dMobile] = checkKey.split("|");
  const changedIdentity =
    dMobile !== initial.mobile ||
    dFirst !== initial.firstName ||
    dLast !== initial.lastName;
  const enoughToCheck = changedIdentity && (dMobile?.length ?? 0) >= 10;

  useEffect(() => {
    if (!enoughToCheck) return;
    let cancelled = false;
    checkDuplicates
      .mutateAsync({
        firstName: dFirst || undefined,
        lastName: dLast || undefined,
        mobile: dMobile || undefined,
      })
      .then((res) => {
        if (!cancelled)
          setDupResult({
            key: checkKey,
            // The record being edited always matches itself.
            matches: res.matches.filter((m) => m.id !== patient.id),
          });
      })
      .catch(() => {
        // Advisory only; saving does not depend on it.
        if (!cancelled) setDupResult({ key: checkKey, matches: [] });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey, enoughToCheck]);

  const matches =
    enoughToCheck && dupResult?.key === checkKey ? dupResult.matches : [];

  const submit = handleSubmit(async (v) => {
    setError(null);
    setUnchanged(false);
    const next = toPayload(v, patient);
    const before = toPayload(initial, patient);
    const patch = Object.fromEntries(
      Object.entries(next).filter(
        ([key, value]) =>
          JSON.stringify(value) !==
          JSON.stringify(before[key as keyof typeof before]),
      ),
    ) as Partial<RegisterPatientPayload>;

    if (Object.keys(patch).length === 0) {
      setUnchanged(true);
      return;
    }

    try {
      await update.mutateAsync(patch);
      openScreen(
        navigation,
        "Patients",
        "PatientDetail",
        { id: patient.id, justUpdated: true },
        { pop: true },
      );
    } catch (err) {
      setError(
        apiErrorCode(err) === "CONFLICT"
          ? "Another record already uses one of these details. Check the patient ID and try again."
          : apiErrorMessage(err, "Could not save these details"),
      );
    }
  });

  return (
    <Screen
      patient={banner}
      overline="Front office"
      title="Edit details"
      subtitle={`${patient.fullName} · ${patient.patientId}`}
      testID="edit-patient-screen"
    >
      <VStack gap={16} style={{ maxWidth: 760 }}>
        {error ? (
          <View testID="edit-error">
            <Banner
              tone="danger"
              message={error}
              onDismiss={() => setError(null)}
            />
          </View>
        ) : null}
        {unchanged ? (
          <Banner
            tone="info"
            message="Nothing has changed, so there is nothing to save."
            onDismiss={() => setUnchanged(false)}
          />
        ) : null}

        <DuplicateWarning
          matches={matches}
          mustConfirm={false}
          onOpenExisting={(m) =>
            openScreen(navigation, "Patients", "PatientDetail", { id: m.id })
          }
        />

        <Card>
          <SectionHeader title="Who they are" />
          <VStack gap={14}>
            <HStack gap={8} align="center">
              <Lock size={14} color={palette.text.tertiary} strokeWidth={2} />
              <Text variant="body-sm" tone="secondary" style={{ flex: 1 }}>
                Patient ID {patient.patientId} stays with them and cannot be
                changed.
              </Text>
            </HStack>

            <HStack gap={12} wrap>
              <View style={{ flex: 1, minWidth: 200 }}>
                <ControlledTextField
                  control={control}
                  name="firstName"
                  label="First name"
                  required
                  testID="edit-firstName"
                  leading={
                    <User
                      size={16}
                      color={palette.text.tertiary}
                      strokeWidth={1.9}
                    />
                  }
                />
              </View>
              <View style={{ flex: 1, minWidth: 200 }}>
                <ControlledTextField
                  control={control}
                  name="lastName"
                  label="Last name"
                  testID="edit-lastName"
                />
              </View>
            </HStack>

            <HStack gap={12} wrap>
              <View style={{ flex: 1, minWidth: 200 }}>
                <ControlledTextField
                  control={control}
                  name="dateOfBirth"
                  label="Date of birth"
                  placeholder="YYYY-MM-DD"
                  testID="edit-dob"
                  hint={
                    hasDob
                      ? "Can be corrected, but not removed."
                      : "Add it if they now know it."
                  }
                  leading={
                    <Calendar
                      size={16}
                      color={palette.text.tertiary}
                      strokeWidth={1.9}
                    />
                  }
                />
              </View>
              {/* Once a date of birth is on file the age comes from it. */}
              {!hasDob ? (
                <View style={{ flex: 1, minWidth: 160 }}>
                  <ControlledTextField
                    control={control}
                    name="approximateAgeYears"
                    label="Approximate age"
                    numericField
                    suffix="years"
                    testID="edit-age"
                    hint="Used when the date of birth is unknown."
                  />
                </View>
              ) : null}
            </HStack>

            <View style={{ maxWidth: 360 }}>
              <Select
                label="Gender"
                required
                value={gender}
                options={GENDERS}
                placeholder="Choose"
                error={formState.errors.gender?.message}
                onChange={(v) => {
                  setGender(v);
                  setValue("gender", v as never, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                }}
              />
            </View>
          </VStack>
        </Card>

        <Card>
          <SectionHeader title="How to reach them" />
          <VStack gap={14}>
            <HStack gap={12} wrap>
              <View style={{ flex: 1, minWidth: 200 }}>
                <ControlledTextField
                  control={control}
                  name="mobile"
                  label="Mobile"
                  required
                  numericField
                  maxLength={13}
                  testID="edit-mobile"
                  leading={
                    <Phone
                      size={16}
                      color={palette.text.tertiary}
                      strokeWidth={1.9}
                    />
                  }
                />
              </View>
              <View style={{ flex: 1, minWidth: 200 }}>
                <ControlledTextField
                  control={control}
                  name="alternatePhone"
                  label="Alternate number"
                  numericField
                  maxLength={13}
                  testID="edit-alternatePhone"
                />
              </View>
            </HStack>

            <ControlledTextField
              control={control}
              name="email"
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              testID="edit-email"
            />

            <ControlledTextField
              control={control}
              name="addressLine1"
              label="Address"
              testID="edit-address"
              leading={
                <MapPin
                  size={16}
                  color={palette.text.tertiary}
                  strokeWidth={1.9}
                />
              }
            />

            <HStack gap={12} wrap>
              <View style={{ flex: 1, minWidth: 150 }}>
                <ControlledTextField
                  control={control}
                  name="city"
                  label="City"
                />
              </View>
              <View style={{ flex: 1, minWidth: 150 }}>
                <ControlledTextField
                  control={control}
                  name="state"
                  label="State"
                />
              </View>
              <View style={{ flex: 1, minWidth: 120 }}>
                <ControlledTextField
                  control={control}
                  name="pincode"
                  label="PIN code"
                  numericField
                  maxLength={6}
                />
              </View>
            </HStack>
          </VStack>
        </Card>

        <Card>
          <SectionHeader
            title="Emergency contact"
            subtitle="Who the hospital calls if something happens"
          />
          <HStack gap={12} wrap>
            <View style={{ flex: 1, minWidth: 180 }}>
              <ControlledTextField
                control={control}
                name="emergencyName"
                label="Name"
                testID="edit-emergencyName"
              />
            </View>
            <View style={{ flex: 1, minWidth: 150 }}>
              <ControlledTextField
                control={control}
                name="emergencyRelationship"
                label="Relationship"
                placeholder="Wife, son, neighbour…"
              />
            </View>
            <View style={{ flex: 1, minWidth: 170 }}>
              <ControlledTextField
                control={control}
                name="emergencyPhone"
                label="Phone"
                numericField
                maxLength={13}
              />
            </View>
          </HStack>
        </Card>

        <Card>
          <SectionHeader title="Other" />
          <ControlledTextField
            control={control}
            name="abhaNumber"
            label="ABHA number"
            placeholder="14 digits"
            numericField
            maxLength={17}
            hint="Optional. Once recorded it can be corrected, not removed."
          />
        </Card>

        <HStack gap={10} justify="flex-end" wrap>
          <Button
            label="Cancel"
            variant="secondary"
            fullWidth={false}
            onPress={() =>
              navigation.canGoBack()
                ? navigation.goBack()
                : openScreen(navigation, "Patients", "PatientDetail", {
                    id: patient.id,
                  })
            }
          />
          <Button
            label="Save details"
            fullWidth={false}
            loading={update.isPending}
            onPress={submit}
            testID="edit-submit"
          />
        </HStack>
      </VStack>
    </Screen>
  );
}
