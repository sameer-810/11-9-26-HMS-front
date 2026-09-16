import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Phone, User, Calendar, MapPin, Scale } from "lucide-react-native";

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
  ConfirmDialog,
} from "@shared/ui";
import { ControlledTextField } from "@shared/form/ControlledTextField";
import { apiErrorCode, apiErrorMessage } from "@api/apiClient";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import {
  useCheckDuplicates,
  useRegisterPatient,
} from "@modules/patient/hooks/usePatients";
import {
  registerPatientSchema,
  type RegisterPatientForm,
} from "@modules/patient/patient.validation";
import { DuplicateWarning } from "@modules/patient/components/DuplicateWarning";
import type {
  DuplicateMatch,
  RegisterPatientPayload,
} from "@modules/patient/types";

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const BLOOD_GROUPS = [
  { value: "unknown", label: "Not known" },
  ...["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => ({
    value: g,
    label: g,
  })),
];

export default function RegisterPatientScreen() {
  const navigation = useNavigation<any>();
  const register = useRegisterPatient();
  const checkDuplicates = useCheckDuplicates();

  const [gender, setGender] = useState<string | null>(null);
  const [bloodGroup, setBloodGroup] = useState<string | null>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  /**
   * Last duplicate-check result with its query key, so a stale one is ignored on render rather
   * than cleared in an effect (which would flash it beside the new details).
   */
  const [dupResult, setDupResult] = useState<{
    key: string;
    matches: DuplicateMatch[];
    mustConfirm: boolean;
  } | null>(null);
  /** Set by the server refusing a save, which outranks anything checked here. */
  const [serverRefused, setServerRefused] = useState(false);

  const { control, handleSubmit, setValue, formState } =
    useForm<RegisterPatientForm>({
      resolver: zodResolver(registerPatientSchema),
      mode: "onTouched",
      defaultValues: {
        firstName: "",
        lastName: "",
        dateOfBirth: "",
        approximateAgeYears: "" as never,
        gender: undefined as never,
        mobile: "",
        alternatePhone: "",
        email: "",
        addressLine1: "",
        city: "",
        state: "",
        pincode: "",
        emergencyName: "",
        emergencyRelationship: "",
        emergencyPhone: "",
        abhaNumber: "",
        isMlc: false,
      },
    });

  // Watched so the duplicate check can run while the form is being filled in,
  // rather than only on submit — the patient is still at the desk now.
  const watched = useWatch({ control });
  const debounced = useDebouncedValue(
    `${watched.firstName || ""}|${watched.lastName || ""}|${watched.mobile || ""}|${watched.dateOfBirth || ""}`,
    500,
  );

  // Not enough typed in to say anything useful yet. Firing on one character
  // would surface half the register and train the desk to ignore the panel.
  const [dFirst, , dMobile] = debounced.split("|");
  const enoughToCheck =
    (dFirst?.length >= 2 && dMobile?.length >= 6) || dMobile?.length >= 10;
  const checkKey = `${debounced}|${watched.gender ?? ""}`;

  useEffect(() => {
    if (!enoughToCheck) return;

    let cancelled = false;
    const [firstName, lastName, mobile, dateOfBirth] = debounced.split("|");

    checkDuplicates
      .mutateAsync({
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        mobile: mobile || undefined,
        dateOfBirth: dateOfBirth || undefined,
        gender: (watched.gender as string) || undefined,
      })
      .then((res) => {
        if (!cancelled) {
          setDupResult({
            key: checkKey,
            matches: res.matches,
            mustConfirm: res.mustConfirm,
          });
        }
      })
      .catch(() => {
        // A failed check must not block registration — the server re-runs it
        // on save regardless, and that is the control.
        if (!cancelled)
          setDupResult({ key: checkKey, matches: [], mustConfirm: false });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey, enoughToCheck]);

  // Only trust the answer if it was asked about the details currently typed in.
  const fresh = enoughToCheck && dupResult?.key === checkKey ? dupResult : null;
  const matches = fresh?.matches ?? [];
  const mustConfirm = Boolean(fresh?.mustConfirm) || serverRefused;

  const toPayload = (v: RegisterPatientForm, confirmedNotDuplicate = false) => {
    const payload: RegisterPatientPayload = {
      firstName: v.firstName,
      lastName: v.lastName || undefined,
      gender: v.gender,
      mobile: v.mobile,
      alternatePhone: v.alternatePhone || undefined,
      email: v.email || undefined,
      bloodGroup: bloodGroup || undefined,
      address: {
        line1: v.addressLine1 || "",
        city: v.city || "",
        state: v.state || "",
        pincode: v.pincode || "",
      },
      emergencyContact: {
        name: v.emergencyName || "",
        relationship: v.emergencyRelationship || "",
        phone: v.emergencyPhone || "",
      },
      abhaNumber: v.abhaNumber || undefined,
      isMlc: Boolean(v.isMlc),
      confirmedNotDuplicate,
    };
    if (v.dateOfBirth) payload.dateOfBirth = v.dateOfBirth;
    else if (
      v.approximateAgeYears !== "" &&
      v.approximateAgeYears !== undefined
    ) {
      payload.approximateAgeYears = Number(v.approximateAgeYears);
    }
    return payload;
  };

  const save = async (
    v: RegisterPatientForm,
    confirmedNotDuplicate = false,
  ) => {
    setError(null);
    try {
      const patient = await register.mutateAsync(
        toPayload(v, confirmedNotDuplicate),
      );
      navigation.replace("PatientDetail", {
        id: patient.id,
        justRegistered: true,
      });
    } catch (err) {
      if (apiErrorCode(err) === "POSSIBLE_DUPLICATE") {
        // The server refused. It knows something the client's check did not —
        // usually because another desk registered this person seconds ago.
        setServerRefused(true);
        setConfirmOpen(true);
        return;
      }
      setError(apiErrorMessage(err, "Could not register this patient"));
    }
  };

  const submit = handleSubmit((v) => {
    if (mustConfirm) {
      setConfirmOpen(true);
      return;
    }
    return save(v, false);
  });

  const confirmAndSave = handleSubmit((v) => {
    setConfirmOpen(false);
    return save(v, true);
  });

  return (
    <Screen
      overline="Front office"
      title="Register patient"
      subtitle="The system issues the patient ID — it cannot be chosen or changed later."
      testID="register-patient-screen"
    >
      <VStack gap={16} style={{ maxWidth: 760 }}>
        {error ? (
          <Banner
            tone="danger"
            message={error}
            onDismiss={() => setError(null)}
          />
        ) : null}

        <DuplicateWarning
          matches={matches}
          mustConfirm={mustConfirm}
          onOpenExisting={(m) =>
            navigation.replace("PatientDetail", { id: m.id })
          }
        />

        <Card>
          <SectionHeader title="Who they are" />
          <VStack gap={14}>
            <HStack gap={12} wrap>
              <View style={{ flex: 1, minWidth: 200 }}>
                <ControlledTextField
                  control={control}
                  name="firstName"
                  label="First name"
                  required
                  testID="reg-firstName"
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
                  testID="reg-lastName"
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
                  testID="reg-dob"
                  hint="Leave blank if not known, and give an age instead."
                  leading={
                    <Calendar
                      size={16}
                      color={palette.text.tertiary}
                      strokeWidth={1.9}
                    />
                  }
                />
              </View>
              <View style={{ flex: 1, minWidth: 160 }}>
                <ControlledTextField
                  control={control}
                  name="approximateAgeYears"
                  label="Approximate age"
                  numericField
                  suffix="years"
                  testID="reg-age"
                  hint="Used when the date of birth is unknown."
                />
              </View>
            </HStack>

            <HStack gap={12} wrap>
              <View style={{ flex: 1, minWidth: 180 }}>
                <Select
                  label="Gender"
                  required
                  value={gender}
                  options={GENDERS}
                  placeholder="Choose"
                  error={formState.errors.gender?.message}
                  onChange={(v) => {
                    setGender(v);
                    setValue("gender", v as never, { shouldValidate: true });
                  }}
                />
              </View>
              <View style={{ flex: 1, minWidth: 180 }}>
                <Select
                  label="Blood group"
                  value={bloodGroup}
                  options={BLOOD_GROUPS}
                  onChange={setBloodGroup}
                />
              </View>
            </HStack>
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
                  testID="reg-mobile"
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
                />
              </View>
            </HStack>

            <ControlledTextField
              control={control}
              name="addressLine1"
              label="Address"
              testID="reg-address"
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
            subtitle="Who to call. This is the field nobody fills in until they need it."
          />
          <HStack gap={12} wrap>
            <View style={{ flex: 1, minWidth: 180 }}>
              <ControlledTextField
                control={control}
                name="emergencyName"
                label="Name"
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
          <VStack gap={14}>
            <ControlledTextField
              control={control}
              name="abhaNumber"
              label="ABHA number"
              placeholder="14 digits"
              numericField
              maxLength={17}
              hint="Optional. A patient without one still gets care."
            />
            <HStack gap={8} align="center">
              <Scale size={15} color={palette.warning.text} strokeWidth={2} />
              <Text variant="body-sm" tone="secondary" style={{ flex: 1 }}>
                Allergies are recorded by clinical staff on the patient&apos;s
                record, not here.
              </Text>
            </HStack>
          </VStack>
        </Card>

        <HStack gap={10} justify="flex-end" wrap>
          <Button
            label="Cancel"
            variant="secondary"
            fullWidth={false}
            onPress={() => navigation.goBack()}
          />
          <Button
            label={mustConfirm ? "Register anyway…" : "Register patient"}
            variant={mustConfirm ? "secondary" : "primary"}
            fullWidth={false}
            loading={register.isPending}
            onPress={submit}
            testID="reg-submit"
          />
        </HStack>
      </VStack>

      {/* Last gate before a second record for one person; spells out the consequence. */}
      <ConfirmDialog
        visible={confirmOpen}
        title="Create a second record?"
        message={
          matches.length === 1
            ? `${matches[0].fullName} (${matches[0].patientId}) matches on ${matches[0].reasons.join(" and ").toLowerCase()}. If this is the same person, open their record instead — a duplicate splits their history.`
            : "Someone matching these details is already registered. If this is the same person, open their record instead — a duplicate splits their history."
        }
        confirmLabel="Yes, this is someone else"
        cancelLabel="Go back"
        destructive
        loading={register.isPending}
        onConfirm={confirmAndSave}
        onCancel={() => setConfirmOpen(false)}
      />
    </Screen>
  );
}
