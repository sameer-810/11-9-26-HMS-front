import React, { useState } from "react";
import { View } from "react-native";

import {
  Card,
  SectionHeader,
  VStack,
  HStack,
  Text,
  TextField,
  Button,
  Banner,
  Skeleton,
  ErrorState,
  StatusChip,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import {
  useHospitalProfile,
  useUpdateHospital,
} from "@modules/admin/hooks/useAdmin";
import type {
  HospitalAddress,
  HospitalPatch,
  HospitalProfile,
} from "@modules/admin/types";

type TopKey =
  | "name"
  | "registrationNumber"
  | "phone"
  | "email"
  | "website"
  | "logoUrl"
  | "hfrId"
  | "gstin"
  | "timezone"
  | "currency";
type AddressKey = keyof HospitalAddress;
type Flat = Record<TopKey | AddressKey, string>;

const TOP: TopKey[] = [
  "name",
  "registrationNumber",
  "phone",
  "email",
  "website",
  "logoUrl",
  "hfrId",
  "gstin",
  "timezone",
  "currency",
];
const ADDRESS: AddressKey[] = [
  "line1",
  "line2",
  "city",
  "state",
  "pincode",
  "country",
];

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/;
const PHONE = /^(\+?\d{1,3}[- ]?)?\d{10}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toFlat(h: HospitalProfile): Flat {
  return {
    name: h.name,
    registrationNumber: h.registrationNumber,
    phone: h.phone,
    email: h.email,
    website: h.website,
    logoUrl: h.logoUrl,
    hfrId: h.hfrId,
    gstin: h.gstin,
    timezone: h.timezone,
    currency: h.currency,
    ...h.address,
  };
}

/** The same rules as hospital.validation.js, checked before the round trip. */
function validate(f: Flat): Partial<Record<keyof Flat, string>> {
  const e: Partial<Record<keyof Flat, string>> = {};
  if (f.name.trim().length < 2) e.name = "At least 2 characters";
  if (f.phone.trim() && !PHONE.test(f.phone.trim()))
    e.phone = "Enter a valid 10-digit number";
  if (f.email.trim() && !EMAIL.test(f.email.trim()))
    e.email = "Enter a valid email address";
  if (f.gstin.trim() && !GSTIN.test(f.gstin.trim().toUpperCase()))
    e.gstin = "Not a valid GSTIN";
  if (f.currency.trim().length !== 3)
    e.currency = "A 3-letter code, such as INR";
  if (f.pincode.trim().length > 10) e.pincode = "At most 10 characters";
  return e;
}

/**
 * Only what changed goes up. The audit entry records the field names sent, and
 * the address travels whole because the API replaces it as one object.
 */
function buildPatch(f: Flat, original: Flat): HospitalPatch {
  const patch: Record<string, unknown> = {};
  for (const k of TOP) {
    let next = f[k].trim();
    if (k === "gstin" || k === "currency") next = next.toUpperCase();
    if (next === original[k]) continue;
    // The API reads an empty phone as "not supplied", so it cannot be cleared.
    if (k === "phone" && next === "") continue;
    patch[k] = next;
  }
  if (ADDRESS.some((k) => f[k].trim() !== original[k])) {
    patch.address = Object.fromEntries(ADDRESS.map((k) => [k, f[k].trim()]));
  }
  return patch as HospitalPatch;
}

export function HospitalProfileForm() {
  const { data, isLoading, isError, error, refetch } = useHospitalProfile();
  if (isLoading) return <Skeleton height={320} />;
  if (isError || !data) return <ErrorState error={error} onRetry={refetch} />;
  // Keyed so a different hospital (or a fresh load) starts a fresh form.
  return <Form key={data.id} hospital={data} />;
}

const IDLE_MIN = 5;
const IDLE_MAX = 480;

function Form({ hospital }: { hospital: HospitalProfile }) {
  const update = useUpdateHospital();
  const [original, setOriginal] = useState<Flat>(() => toFlat(hospital));
  const [form, setForm] = useState<Flat>(original);
  // A number, kept apart from the text fields the patch builder trims.
  const [idleOriginal, setIdleOriginal] = useState(
    String(hospital.sessionIdleMinutes ?? 30),
  );
  const [idle, setIdle] = useState(idleOriginal);
  const [attempted, setAttempted] = useState(false);
  const [saved, setSaved] = useState(false);

  const idleValue = Number(idle);
  const idleError =
    !/^\d+$/.test(idle.trim()) || idleValue < IDLE_MIN || idleValue > IDLE_MAX
      ? `Between ${IDLE_MIN} and ${IDLE_MAX} minutes`
      : undefined;
  const errors: Partial<Record<keyof Flat | "sessionIdleMinutes", string>> = {
    ...validate(form),
    ...(idleError ? { sessionIdleMinutes: idleError } : {}),
  };
  const patch: HospitalPatch = {
    ...buildPatch(form, original),
    ...(!idleError && idle.trim() !== idleOriginal
      ? { sessionIdleMinutes: idleValue }
      : {}),
  };
  // An invalid timeout is still a change: saving must be pressable so the
  // error can be shown, rather than a disabled button with no reason given.
  const changed = Object.keys(patch).length > 0 || idle.trim() !== idleOriginal;

  const set = (k: keyof Flat) => (v: string) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const err = (k: keyof Flat | "sessionIdleMinutes") =>
    attempted ? errors[k] : undefined;

  const field = (
    k: keyof Flat,
    label: string,
    extra: Partial<React.ComponentProps<typeof TextField>> = {},
  ) => (
    <View style={{ flex: 1, minWidth: 220 }}>
      <TextField
        label={label}
        value={form[k]}
        onChangeText={set(k)}
        error={err(k)}
        testID={`hospital-${k}`}
        {...extra}
      />
    </View>
  );

  const submit = () => {
    setAttempted(true);
    if (Object.keys(errors).length > 0 || !changed) return;
    update.mutate(patch, {
      onSuccess: (h) => {
        const fresh = toFlat(h);
        setOriginal(fresh);
        setForm(fresh);
        setIdleOriginal(String(h.sessionIdleMinutes));
        setIdle(String(h.sessionIdleMinutes));
        setAttempted(false);
        setSaved(true);
      },
    });
  };

  return (
    <VStack gap={14} testID="hospital-profile">
      {update.isError ? (
        <View testID="hospital-error">
          <Banner
            tone="danger"
            message={apiErrorMessage(
              update.error,
              "Could not save the hospital details",
            )}
          />
        </View>
      ) : null}
      {saved ? (
        <View testID="hospital-saved">
          <Banner
            tone="success"
            message="Hospital details saved. New slips and receipts use them straight away."
          />
        </View>
      ) : null}

      <Card>
        <SectionHeader
          title="Identity"
          right={
            <StatusChip
              status={
                hospital.approvalStatus === "approved"
                  ? "active"
                  : hospital.approvalStatus
              }
              size="sm"
            />
          }
        />
        <VStack gap={14}>
          <HStack gap={12} wrap>
            {field("name", "Hospital name", { required: true })}
            <View style={{ flex: 1, minWidth: 220 }}>
              <TextField
                label="Hospital code"
                value={hospital.code}
                editable={false}
                hint="Set by the platform. Every patient and bill number already issued contains it."
                testID="hospital-code"
              />
            </View>
          </HStack>
          <HStack gap={12} wrap>
            {field("registrationNumber", "Registration number")}
            {field("hfrId", "Health Facility Registry ID", {
              hint: "When the hospital is registered with ABDM.",
            })}
          </HStack>
          <HStack gap={12} wrap>
            {field("gstin", "GSTIN", {
              autoCapitalize: "characters",
              hint: "Printed on bills and receipts.",
            })}
            {field("logoUrl", "Logo URL", { autoCapitalize: "none" })}
          </HStack>
          <Text variant="caption" tone="tertiary">
            Plan: {hospital.subscription.planCode} (
            {hospital.subscription.status})
          </Text>
        </VStack>
      </Card>

      <Card>
        <SectionHeader title="Contact" />
        <VStack gap={14}>
          <HStack gap={12} wrap>
            {field("phone", "Phone", { keyboardType: "phone-pad" })}
            {field("email", "Email", {
              keyboardType: "email-address",
              autoCapitalize: "none",
            })}
            {field("website", "Website", { autoCapitalize: "none" })}
          </HStack>
          <HStack gap={12} wrap>
            {field("line1", "Address line 1")}
            {field("line2", "Address line 2")}
          </HStack>
          <HStack gap={12} wrap>
            {field("city", "City")}
            {field("state", "State")}
            {field("pincode", "PIN code", { keyboardType: "number-pad" })}
            {field("country", "Country")}
          </HStack>
        </VStack>
      </Card>

      <Card>
        <SectionHeader
          title="Locale"
          subtitle="The timezone decides which calendar day an appointment or a drug round falls on."
        />
        <HStack gap={12} wrap>
          {field("timezone", "Timezone", {
            autoCapitalize: "none",
            hint: "IANA name, such as Asia/Kolkata.",
          })}
          {field("currency", "Currency", {
            autoCapitalize: "characters",
            maxLength: 3,
          })}
        </HStack>
      </Card>

      <Card>
        <SectionHeader
          title="Sign-in"
          subtitle="A screen left open at a nursing station shows the next person whatever the last one was reading."
        />
        <View style={{ maxWidth: 360 }}>
          <TextField
            label="Sign out after inactivity"
            value={idle}
            onChangeText={(v) => {
              setSaved(false);
              setIdle(v);
            }}
            numericField
            suffix="minutes"
            error={err("sessionIdleMinutes")}
            hint={`Between ${IDLE_MIN} and ${IDLE_MAX}. After this long without a tap or keypress the screen warns for a minute, then signs out. Nothing waiting to send is lost.`}
            testID="hospital-sessionIdleMinutes"
          />
        </View>
      </Card>

      <HStack gap={8} wrap align="center">
        <Button
          label="Save hospital details"
          fullWidth={false}
          disabled={!changed}
          loading={update.isPending}
          onPress={submit}
          testID="hospital-save"
        />
        {attempted && Object.keys(errors).length > 0 ? (
          <Text variant="caption" tone="danger">
            Fix the highlighted fields first.
          </Text>
        ) : null}
      </HStack>
    </VStack>
  );
}
